"use client";

import { useI18n } from "@/components/i18n-provider";

/** StyleGuide §5.3: the two highlight colors, named by what they ask of the user. */
export function HighlightLegend() {
  const { t } = useI18n();
  return (
    <ul aria-label={t.inspector.legend} className="flex flex-wrap gap-x-4 gap-y-1 text-small text-secondary">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 shrink-0 rounded-[2px] border-[1.5px] border-critical-strong bg-critical/25" />
        {t.results.priority.high}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 shrink-0 rounded-[2px] border-[1.5px] border-advisory-strong bg-advisory/25" />
        {t.inspector.legendAdvisory}
      </li>
    </ul>
  );
}
