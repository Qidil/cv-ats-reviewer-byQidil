"use client";

import { ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { AtsCheck } from "@/types/ats";
import { STATUS_BAR, STATUS_TEXT, STATUS_TONE, scoreStatus, staggerVariants } from "./status";

export function ScoreSummary({ score }: { score: number }) {
  const { t } = useI18n();
  const status = scoreStatus(score);
  return (
    <section aria-labelledby="score-heading" className="rounded-lg border border-subtle bg-surface p-5">
      <h3 id="score-heading" className="text-small font-medium text-secondary">
        {t.results.score}
      </h3>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-display tabular-nums">{score}</span>
        <span className="text-secondary">{t.results.scoreOutOf}</span>
      </p>
      <p className={cn("mt-1 font-medium", STATUS_TEXT[status])}>{t.results.status[status]}</p>
      <div aria-hidden className="mt-4 h-2 overflow-hidden rounded-full bg-surface-elevated">
        <div className={cn("h-full rounded-full", STATUS_BAR[status])} style={{ width: `${score}%` }} />
      </div>
    </section>
  );
}

/** Evidence stays folded so the six scores read at a glance (StyleGuide §1.4). */
export function CheckList({ checks }: { checks: readonly AtsCheck[] }) {
  const { t } = useI18n();
  const { list, item } = staggerVariants(useReducedMotion() === true);
  return (
    <section aria-labelledby="checks-heading">
      <h3 id="checks-heading" className="mb-3 text-h3">
        {t.results.checks}
      </h3>
      <motion.ul
        variants={list}
        initial="hidden"
        animate="shown"
        className="divide-y divide-subtle rounded-lg border border-subtle bg-surface"
      >
        {checks.map((check) => (
          <motion.li key={check.id} variants={item}>
            <details className="group">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 font-medium">{check.name}</span>
                <Badge tone={STATUS_TONE[check.status]}>{t.results.status[check.status]}</Badge>
                <span className="w-8 text-right tabular-nums text-secondary">{check.score}</span>
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-secondary transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="px-4 pb-4 text-secondary">{check.detail}</p>
            </details>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}
