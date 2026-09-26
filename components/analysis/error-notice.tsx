"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { useI18n } from "@/components/i18n-provider";
import { DailyQuotaNotice, HourlyLimitNotice } from "@/components/settings/quota-notice";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ClientFailure } from "@/lib/client/analyze";
import type { ApiErrorCode } from "@/types/api";

export type DashboardError =
  | { kind: "api"; code: ApiErrorCode; message: string; retryable: boolean; resetsAt?: string }
  | { kind: "client"; failure: ClientFailure };

/** PRD §6.3: these clear the chosen file, so the dashboard shows them under the upload area. */
const FILE_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "PDF_INVALID",
  "PDF_TOO_LARGE",
  "PDF_PASSWORD_PROTECTED",
  "PDF_TOO_MANY_PAGES",
  "PDF_NO_TEXT_FOUND",
  "PDF_TOO_COMPLEX",
]);

/** Saving or removing a personal key is the remedy for these, so a key change makes them stale. */
const KEY_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "AUTH_INVALID_KEY",
  "CREDITS_EXHAUSTED",
  "DAILY_QUOTA_EXCEEDED",
  "RATE_LIMITED_429",
  "QUOTA_CHECK_FAILED",
  "SERVICE_NOT_CONFIGURED",
]);

export function isFileError(error: DashboardError): boolean {
  return error.kind === "api" ? FILE_CODES.has(error.code) : error.failure === "PAYLOAD_TOO_LARGE";
}

export function isKeyError(error: DashboardError): boolean {
  return error.kind === "api" ? KEY_CODES.has(error.code) : error.failure === "KEY_UNSENDABLE";
}

/** True when sending again can work right away; the main button then reads "Try again". */
export function canRetryNow(error: DashboardError): boolean {
  if (error.kind === "client") {
    return error.failure !== "PAYLOAD_TOO_LARGE" && error.failure !== "KEY_UNSENDABLE";
  }
  // Retryable only after resetsAt; an immediate retry would be refused again.
  return error.retryable && error.code !== "TOO_MANY_REQUESTS";
}

/** FEAT-06: the catalog message plus the action that fits the code (api.md, StyleGuide §7.4/§7.5). */
export function ErrorNotice({
  error,
  usingOwnKey,
  onOpenSettings,
  onRemoveKey,
  ref,
}: {
  error: DashboardError;
  usingOwnKey: boolean;
  onOpenSettings: () => void;
  onRemoveKey: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const { t } = useI18n();

  if (error.kind === "api" && error.resetsAt && error.code === "DAILY_QUOTA_EXCEEDED") {
    return <DailyQuotaNotice ref={ref} resetsAt={error.resetsAt} onUseOwnKey={onOpenSettings} />;
  }
  if (error.kind === "api" && error.resetsAt && error.code === "TOO_MANY_REQUESTS") {
    return <HourlyLimitNotice ref={ref} resetsAt={error.resetsAt} />;
  }

  const clientMessages: Readonly<Record<ClientFailure, string>> = {
    PAYLOAD_TOO_LARGE: t.upload.tooLarge,
    SERVER_UNREACHABLE: t.errors.serverUnreachable,
    NO_CONNECTION: t.errors.noConnection,
    UNREADABLE: t.errors.unreadable,
    KEY_UNSENDABLE: t.errors.keyUnsendable,
  };
  const message = error.kind === "api" ? error.message : clientMessages[error.failure];

  const settings = (
    <Button key="settings" variant="secondary" onClick={onOpenSettings}>
      {t.actions.openSettings}
    </Button>
  );
  const removeKey = (
    <Button key="remove" variant="secondary" onClick={onRemoveKey}>
      {t.actions.removeKey}
    </Button>
  );
  const buttons: ReactNode[] = [];
  if (error.kind === "client" && error.failure === "KEY_UNSENDABLE") {
    buttons.push(settings, removeKey);
  }
  if (error.kind === "api") {
    switch (error.code) {
      case "AUTH_INVALID_KEY":
        buttons.push(settings, removeKey);
        break;
      case "CREDITS_EXHAUSTED":
        buttons.push(settings);
        break;
      case "INVALID_INPUT":
        // With a personal key the message points at the model and address in Settings (G-18).
        if (usingOwnKey) {
          buttons.push(settings);
        }
        break;
      case "DAILY_QUOTA_EXCEEDED":
      case "RATE_LIMITED_429":
      case "QUOTA_CHECK_FAILED":
      case "SERVICE_NOT_CONFIGURED":
        if (!usingOwnKey) {
          buttons.push(
            <Button key="own-key" variant="secondary" onClick={onOpenSettings}>
              {t.actions.useOwnKey}
            </Button>,
          );
        } else if (error.code === "SERVICE_NOT_CONFIGURED") {
          // DELTA-52: the remedy is a recognized key without an endpoint address.
          buttons.push(settings);
        }
        break;
      default:
        break;
    }
  }

  return (
    <Alert
      ref={ref}
      tone="critical"
      icon={AlertTriangle}
      title={t.errors.title}
      actions={buttons.length > 0 ? buttons : undefined}
    >
      <p>{message}</p>
    </Alert>
  );
}
