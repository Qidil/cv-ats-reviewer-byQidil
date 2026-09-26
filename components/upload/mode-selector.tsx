"use client";

import { useId, type Ref } from "react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/cn";
import { fillTemplate } from "@/lib/i18n/format";
import type { AnalysisMode } from "@/types/ats";

/** api.md request field limits. */
export const JOB_TITLE_MAX = 200;
export const JOB_DESCRIPTION_MAX = 20_000;

const fieldClass =
  "w-full rounded-md border border-strong bg-app px-3 text-body text-primary placeholder:text-muted disabled:opacity-60";

/**
 * The two analysis types as radio cards: each option needs its one-line description, which a
 * segmented control has no room for (plan §5).
 */
export function ModeSelector({
  mode,
  onModeChange,
  jobTitle,
  onJobTitleChange,
  jobDescription,
  onJobDescriptionChange,
  disabled,
  missingDescription,
  descriptionRef,
}: {
  mode: AnalysisMode;
  onModeChange: (mode: AnalysisMode) => void;
  jobTitle: string;
  onJobTitleChange: (value: string) => void;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  disabled: boolean;
  missingDescription: boolean;
  descriptionRef?: Ref<HTMLTextAreaElement>;
}) {
  const { t, language } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const hintId = useId();
  const counterId = useId();
  const missingId = useId();
  const number = (value: number) => value.toLocaleString(language === "id" ? "id-ID" : "en-US");
  // The default type leads, so the selected card is the first one read.
  const options: ReadonlyArray<{ value: AnalysisMode; label: string; description: string }> = [
    { value: "mode-b", label: t.mode.modeB, description: t.mode.modeBDescription },
    { value: "mode-a", label: t.mode.modeA, description: t.mode.modeADescription },
  ];
  const describedBy = [hintId, counterId, missingDescription ? missingId : null].filter(Boolean).join(" ");

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="mb-2 text-small font-medium text-secondary">{t.mode.legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors",
              mode === option.value ? "border-action bg-action/10" : "border-subtle bg-surface hover:border-strong",
            )}
          >
            <input
              type="radio"
              name="analysis-mode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => onModeChange(option.value)}
              className="mt-1 size-4 shrink-0 accent-[var(--color-action)]"
            />
            <span>
              <span className="block font-medium">{option.label}</span>
              <span className="block text-small text-secondary">{option.description}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === "mode-a" ? (
        <div className="space-y-4">
          <div>
            <label htmlFor={titleId} className="mb-1.5 block text-small font-medium">
              {t.mode.jobTitle}
            </label>
            <input
              id={titleId}
              value={jobTitle}
              maxLength={JOB_TITLE_MAX}
              autoComplete="off"
              onChange={(event) => onJobTitleChange(event.target.value)}
              className={cn(fieldClass, "min-h-11")}
            />
          </div>
          <div>
            <label htmlFor={descriptionId} className="mb-1.5 block text-small font-medium">
              {t.mode.jobDescription}
            </label>
            <textarea
              ref={descriptionRef}
              id={descriptionId}
              value={jobDescription}
              rows={8}
              maxLength={JOB_DESCRIPTION_MAX}
              aria-required="true"
              aria-invalid={missingDescription}
              aria-describedby={describedBy}
              onChange={(event) => onJobDescriptionChange(event.target.value)}
              className={cn(fieldClass, "py-2 leading-6", missingDescription && "border-critical")}
            />
            <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-small text-secondary">
              <span id={hintId}>{t.mode.jobDescriptionHint}</span>
              <span id={counterId} className="tabular-nums">
                {fillTemplate(t.mode.counter, { count: number(jobDescription.length), max: number(JOB_DESCRIPTION_MAX) })}
              </span>
            </div>
            {missingDescription ? (
              <p id={missingId} role="alert" className="mt-1.5 text-small text-critical">
                {t.mode.jobDescriptionMissing}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
