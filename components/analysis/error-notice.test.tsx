// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/components/test-utils/render";
import type { Language } from "@/lib/i18n/language";
import type { ApiErrorCode } from "@/types/api";
import { ErrorNotice, canRetryNow, isFileError, isKeyError, type DashboardError } from "./error-notice";

const apiError = (code: ApiErrorCode, extra: Partial<Extract<DashboardError, { kind: "api" }>> = {}): DashboardError => ({
  kind: "api",
  code,
  message: `Server message for ${code}.`,
  retryable: false,
  ...extra,
});

function renderNotice(error: DashboardError, options: { usingOwnKey?: boolean; language?: Language } = {}) {
  const onOpenSettings = vi.fn();
  const onRemoveKey = vi.fn();
  renderWithI18n(
    <ErrorNotice error={error} usingOwnKey={options.usingOwnKey ?? false} onOpenSettings={onOpenSettings} onRemoveKey={onRemoveKey} />,
    options.language,
  );
  return { onOpenSettings, onRemoveKey };
}

describe("error routing", () => {
  it("sends PDF problems and Vercel's own 413 to the upload area (PRD §6.3)", () => {
    expect(isFileError(apiError("PDF_NO_TEXT_FOUND"))).toBe(true);
    expect(isFileError({ kind: "client", failure: "PAYLOAD_TOO_LARGE" })).toBe(true);
    expect(isFileError(apiError("RATE_LIMITED_429"))).toBe(false);
  });

  it("offers an immediate retry only when one can work", () => {
    expect(canRetryNow(apiError("MODEL_UNAVAILABLE", { retryable: true }))).toBe(true);
    expect(canRetryNow(apiError("TOO_MANY_REQUESTS", { retryable: true }))).toBe(false);
    expect(canRetryNow(apiError("PDF_INVALID"))).toBe(false);
    expect(canRetryNow({ kind: "client", failure: "NO_CONNECTION" })).toBe(true);
    expect(canRetryNow({ kind: "client", failure: "KEY_UNSENDABLE" })).toBe(false);
  });

  it("knows which errors a key change resolves", () => {
    expect(isKeyError(apiError("DAILY_QUOTA_EXCEEDED"))).toBe(true);
    expect(isKeyError(apiError("TOO_MANY_REQUESTS"))).toBe(false);
    expect(isKeyError({ kind: "client", failure: "KEY_UNSENDABLE" })).toBe(true);
  });
});

describe("ErrorNotice", () => {
  it("offers Settings and a one-click reset for a rejected key", () => {
    const { onOpenSettings, onRemoveKey } = renderNotice(apiError("AUTH_INVALID_KEY"), { usingOwnKey: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Server message for AUTH_INVALID_KEY.");
    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove my key" }));
    expect(onOpenSettings).toHaveBeenCalled();
    expect(onRemoveKey).toHaveBeenCalled();
  });

  it("asks for the key again when the browser cannot send it (G-03)", () => {
    const { onOpenSettings, onRemoveKey } = renderNotice({ kind: "client", failure: "KEY_UNSENDABLE" }, { usingOwnKey: true });
    expect(screen.getByRole("alert")).toHaveTextContent("The saved API key contains characters that cannot be sent.");
    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove my key" }));
    expect(onOpenSettings).toHaveBeenCalled();
    expect(onRemoveKey).toHaveBeenCalled();
  });

  it("points a personal key at Settings for an invalid request, and the free quota at nothing (G-18)", () => {
    renderNotice(apiError("INVALID_INPUT"), { usingOwnKey: true });
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeInTheDocument();
  });

  it("offers nothing for an invalid request on the free quota", () => {
    renderNotice(apiError("INVALID_INPUT"));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers Settings when this server cannot call custom endpoints (DELTA-52)", () => {
    renderNotice(apiError("SERVICE_NOT_CONFIGURED"), { usingOwnKey: true });
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use my own API key" })).not.toBeInTheDocument();
  });

  it("shows the daily quota notice with the reset time and the personal-key way out (§7.4)", () => {
    const { onOpenSettings } = renderNotice(apiError("DAILY_QUOTA_EXCEEDED", { resetsAt: "2026-09-27T00:00:00+08:00" }));
    expect(screen.getByText("Today's free analyses are used up")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("resets at 00:00 GMT+8");
    fireEvent.click(screen.getByRole("button", { name: "Use my own API key" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("writes the daily reset time the Indonesian way", () => {
    renderNotice(apiError("DAILY_QUOTA_EXCEEDED", { resetsAt: "2026-09-27T00:00:00+08:00" }), { language: "id" });
    expect(screen.getByRole("alert")).toHaveTextContent("pukul 00.00 GMT+8");
  });

  it("shows the hourly notice without a personal-key action (§7.5)", () => {
    renderNotice(apiError("TOO_MANY_REQUESTS", { resetsAt: "2026-09-26T15:00:00+08:00", retryable: true }));
    expect(screen.getByRole("alert")).toHaveTextContent("Hourly limit reached");
    expect(screen.getByRole("alert")).toHaveTextContent("Try again at 15:00 GMT+8.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("suggests a personal key for busy free models only when none is in use", () => {
    renderNotice(apiError("RATE_LIMITED_429", { retryable: true }));
    expect(screen.getByRole("button", { name: "Use my own API key" })).toBeInTheDocument();
  });

  it("leaves out the personal-key action when a key is already in use", () => {
    renderNotice(apiError("RATE_LIMITED_429", { retryable: true }), { usingOwnKey: true });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the local message for a failure outside the catalog", () => {
    renderNotice({ kind: "client", failure: "NO_CONNECTION" });
    expect(screen.getByRole("alert")).toHaveTextContent("No connection to the server.");
  });
});
