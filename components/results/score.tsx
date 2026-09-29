"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { DrawablyCard, DrawablyCircle, DrawablyHighlight } from "@/lib/drawably";
import { cn } from "@/lib/cn";
import type { AtsCheck } from "@/types/ats";
import { EASE_OUT, STATUS_BAR, STATUS_TEXT, STATUS_TONE, scoreStatus, staggerVariants } from "./status";

export function ScoreSummary({ score }: { score: number }) {
  const { t } = useI18n();
  const status = scoreStatus(score);
  const reduceMotion = useReducedMotion() === true;
  return (
    <section data-section="score" aria-labelledby="score-heading">
      <DrawablyCard className="p-5">
        <h3 id="score-heading" className="text-small font-medium text-secondary">
          {t.results.score}
        </h3>
        <p className="mt-1 flex items-baseline gap-2">
          <DrawablyCircle className="inline-block px-1.5">
            <DrawablyHighlight className="px-1">
              <span className="text-display tabular-nums">{score}</span>
            </DrawablyHighlight>
          </DrawablyCircle>
          <span className="text-secondary">{t.results.scoreOutOf}</span>
        </p>
        <p className={cn("mt-1 font-medium", STATUS_TEXT[status])}>{t.results.status[status]}</p>
        <div aria-hidden className="mt-4 h-2 overflow-hidden rounded-full bg-paper">
          <motion.div
            className={cn("h-full rounded-full", STATUS_BAR[status])}
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: reduceMotion ? 0 : 0.6, ease: EASE_OUT }}
          />
        </div>
      </DrawablyCard>
    </section>
  );
}

/** Evidence stays folded so the six scores read at a glance (StyleGuide §1.4). */
export function CheckList({ checks }: { checks: readonly AtsCheck[] }) {
  const { t } = useI18n();
  const { list, item } = staggerVariants(useReducedMotion() === true);
  return (
    <section data-section="checks" aria-labelledby="checks-heading">
      <h3 id="checks-heading" className="mb-3 text-h3">
        {t.results.checks}
      </h3>
      <DrawablyCard className="p-2">
        <motion.ul
          variants={list}
          initial="hidden"
          animate="shown"
          className="divide-y divide-subtle/50"
        >
          {checks.map((check) => (
            <motion.li key={check.id} variants={item}>
              <CheckRow check={check} label={t.results.status[check.status]} />
            </motion.li>
          ))}
        </motion.ul>
      </DrawablyCard>
    </section>
  );
}

/** Phase 10: a controlled row with an animated panel instead of the native details element. */
function CheckRow({ check, label }: { check: AtsCheck; label: string }) {
  const reduceMotion = useReducedMotion() === true;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1 font-medium">{check.name}</span>
        <Badge tone={STATUS_TONE[check.status]}>{label}</Badge>
        <span className="w-8 text-right tabular-nums text-secondary">{check.score}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-secondary transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-4 text-secondary">{check.detail}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
