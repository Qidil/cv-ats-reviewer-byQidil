"use client";

import { useEffect, useId, useState, type Ref } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fillTemplate } from "@/lib/i18n/format";

/**
 * T7: the real upload percent, then the honest elapsed time; no invented step percentages. The card
 * takes focus when an analysis starts (G-12), so it is a named group a keyboard can land on.
 */
export function AnalysisProgress({
  stage,
  fraction,
  startedAt,
  onCancel,
  ref,
}: {
  stage: "uploading" | "processing";
  fraction: number;
  startedAt: number;
  onCancel: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(startedAt);
  const titleId = useId();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const percent = Math.round(fraction * 100);
  const uploading = fillTemplate(t.progress.uploading, { percent });

  return (
    <div ref={ref} tabIndex={-1} role="group" aria-labelledby={titleId} className="rounded-lg border border-subtle bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p id={titleId} className="font-medium">
          {stage === "uploading" ? uploading : t.progress.analyzing}
        </p>
        {/* Visual only: announcing every second would drown out a screen reader. */}
        <span aria-hidden className="text-small text-secondary tabular-nums">
          {fillTemplate(t.progress.elapsed, { seconds })}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        {stage === "processing" ? t.progress.analyzing : ""}
      </p>
      {stage === "uploading" ? (
        <div
          role="progressbar"
          aria-label={uploading}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-elevated"
        >
          <div className="h-full rounded-full bg-action transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      ) : (
        <Skeleton className="mt-3 h-1.5 rounded-full bg-action" />
      )}
      <p className="mt-3 text-small text-secondary">{t.progress.note}</p>
      <Button variant="secondary" className="mt-4" onClick={onCancel}>
        {t.actions.cancel}
      </Button>
    </div>
  );
}
