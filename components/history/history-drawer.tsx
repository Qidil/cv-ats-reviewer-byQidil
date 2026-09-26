"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { STATUS_TONE, scoreStatus } from "@/components/results/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { listHistory, type HistoryEntry } from "@/lib/client/history";
import type { CvAtsStorage } from "@/lib/db/storage";
import { fillTemplate, formatDateTime } from "@/lib/i18n/format";

export interface HistoryActions {
  /** Resolves false when the CV is gone (deleted in another tab); the list then reloads. */
  onOpenCv: (cvId: number) => Promise<boolean>;
  onDeleteCv: (cvId: number) => Promise<void>;
  onClearAll: () => Promise<void>;
}

/** FEAT-09. `storage` is undefined while the browser is still being checked, null when IndexedDB is blocked. */
export function HistoryDrawer({
  open,
  onClose,
  storage,
  busy,
  activeCvId,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  storage: CvAtsStorage | null | undefined;
  busy: boolean;
  activeCvId: number | null;
  actions: HistoryActions;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} title={t.history.title} side="end">
      {storage === null ? (
        <p className="text-secondary">{t.history.unavailable}</p>
      ) : storage === undefined ? (
        <LoadingRows />
      ) : (
        <HistoryList storage={storage} busy={busy} activeCvId={activeCvId} actions={actions} />
      )}
    </Dialog>
  );
}

function LoadingRows() {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <p role="status" className="sr-only">
        {t.history.loading}
      </p>
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}

type ListState = { kind: "loading" } | { kind: "ready"; entries: HistoryEntry[] } | { kind: "failed" };

function HistoryList({
  storage,
  busy,
  activeCvId,
  actions,
}: {
  storage: CvAtsStorage;
  busy: boolean;
  activeCvId: number | null;
  actions: HistoryActions;
}) {
  const { t, language } = useI18n();
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [reloads, setReloads] = useState(0);
  const [confirming, setConfirming] = useState<number | "all" | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<string | null>(null);
  const labelPrefix = useId();
  const openId = `${labelPrefix}-open`;

  useEffect(() => {
    let cancelled = false;
    listHistory(storage).then(
      (entries) => {
        if (!cancelled) {
          setList({ kind: "ready", entries });
        }
      },
      () => {
        if (!cancelled) {
          setList({ kind: "failed" });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [storage, reloads]);

  const reload = () => setReloads((count) => count + 1);

  // The safe choice gets focus when a confirmation opens; closing it returns focus to its trigger.
  useEffect(() => {
    if (confirming !== null) {
      keepButton.current?.focus();
    } else if (returnFocusTo.current !== null) {
      container.current?.querySelector<HTMLElement>(`[data-focus-key="${returnFocusTo.current}"]`)?.focus();
      returnFocusTo.current = null;
    }
  }, [confirming]);

  const cancelConfirm = () => {
    returnFocusTo.current = confirming === "all" ? "clear-all" : `delete-${confirming}`;
    setConfirming(null);
  };

  const confirmDelete = async () => {
    const target = confirming;
    setDeleteFailed(false);
    try {
      if (target === "all") {
        await actions.onClearAll();
      } else if (target !== null) {
        await actions.onDeleteCv(target);
      }
    } catch {
      setDeleteFailed(true);
    }
    setConfirming(null);
    reload();
    container.current?.focus();
  };

  const open = async (cvId: number) => {
    if (!(await actions.onOpenCv(cvId))) {
      reload();
    }
  };

  if (list.kind === "loading") {
    return <LoadingRows />;
  }
  if (list.kind === "failed") {
    return (
      <p role="alert" className="text-secondary">
        {t.history.loadFailed}
      </p>
    );
  }

  const confirmation = (message: string) => (
    <div className="rounded-lg border border-critical-strong/60 bg-surface p-3">
      <p>{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="danger" onClick={() => void confirmDelete()}>
          {t.history.confirm}
        </Button>
        <Button ref={keepButton} variant="secondary" onClick={cancelConfirm}>
          {t.history.cancel}
        </Button>
      </div>
    </div>
  );

  return (
    <div ref={container} tabIndex={-1} className="space-y-3 rounded-md">
      {/* Only a label source for the row buttons; aria-labelledby reads hidden elements too. */}
      <span id={openId} hidden>
        {t.history.open}
      </span>
      {busy ? <p className="text-small text-secondary">{t.history.busy}</p> : null}
      {deleteFailed ? (
        <p role="alert" className="text-small text-red-400">
          {t.history.deleteFailed}
        </p>
      ) : null}
      {list.entries.length === 0 ? (
        <p className="text-secondary">{t.history.empty}</p>
      ) : (
        <ul className="space-y-2">
          {list.entries.map(({ cv, latest }) => {
            if (confirming === cv.id) {
              return <li key={cv.id}>{confirmation(fillTemplate(t.history.removeConfirm, { name: cv.fileName }))}</li>;
            }
            const current = cv.id === activeCvId;
            const modeLabel = !latest
              ? null
              : latest.mode === "mode-b"
                ? t.results.modeB
                : latest.targetJobTitle
                  ? fillTemplate(t.results.modeA, { title: latest.targetJobTitle })
                  : t.results.modeAUntitled;
            const meta = [
              formatDateTime(cv.uploadedAt, language),
              cv.pageCount === 1 ? t.history.onePage : fillTemplate(t.history.pages, { count: cv.pageCount }),
              modeLabel,
              // T16: a result keeps its language, so say which when it differs from the interface.
              latest && latest.language !== language ? t.languageNames[latest.language] : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const ids = { name: `${labelPrefix}-${cv.id}-name`, meta: `${labelPrefix}-${cv.id}-meta`, score: `${labelPrefix}-${cv.id}-score` };
            return (
              <li
                key={cv.id}
                className={cn(
                  "flex items-center gap-1 rounded-lg border bg-surface",
                  current ? "border-action" : "border-subtle",
                )}
              >
                <button
                  type="button"
                  disabled={busy}
                  aria-current={current ? "true" : undefined}
                  // Built from its parts so the name keeps its word breaks whatever the layout.
                  aria-labelledby={[openId, ids.name, ids.meta, latest ? ids.score : null].filter(Boolean).join(" ")}
                  onClick={() => void open(cv.id)}
                  // The badge wraps under the details when the text column would drop below 10rem (G-13).
                  className="flex min-h-14 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 basis-40">
                    <span id={ids.name} className="block truncate font-medium">
                      {cv.fileName}
                    </span>
                    <span id={ids.meta} className="mt-0.5 block text-small text-secondary">
                      {meta}
                    </span>
                  </span>
                  {latest ? (
                    <span id={ids.score}>
                      <Badge tone={STATUS_TONE[scoreStatus(latest.overallScore)]}>
                        {fillTemplate(t.history.score, { score: latest.overallScore })}
                      </Badge>
                    </span>
                  ) : null}
                </button>
                <Button
                  variant="icon"
                  className="mr-1 shrink-0"
                  disabled={busy}
                  data-focus-key={`delete-${cv.id}`}
                  aria-label={`${t.history.remove}: ${cv.fileName}`}
                  onClick={() => setConfirming(cv.id)}
                >
                  <Trash2 aria-hidden className="size-5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {list.entries.length > 0 ? (
        confirming === "all" ? (
          confirmation(t.history.clearConfirm)
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            data-focus-key="clear-all"
            onClick={() => setConfirming("all")}
          >
            {t.history.clearAll}
          </Button>
        )
      ) : null}
    </div>
  );
}
