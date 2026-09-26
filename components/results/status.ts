import type { Variants } from "motion/react";
import type { Tone } from "@/components/ui/badge";
import { ATS_STATUS_THRESHOLDS, type AtsCheckStatus, type SuggestionPriority } from "@/types/ats";

/** BR-04 bands, kept here so the browser does not load the server rubric for three comparisons. */
export function scoreStatus(score: number): AtsCheckStatus {
  if (score >= ATS_STATUS_THRESHOLDS.pass) return "pass";
  if (score >= ATS_STATUS_THRESHOLDS.warn) return "warn";
  return "fail";
}

export const STATUS_TONE: Readonly<Record<AtsCheckStatus, Tone>> = { pass: "pass", warn: "advisory", fail: "critical" };

export const STATUS_TEXT: Readonly<Record<AtsCheckStatus, string>> = {
  pass: "text-pass",
  warn: "text-advisory",
  fail: "text-critical",
};

export const STATUS_BAR: Readonly<Record<AtsCheckStatus, string>> = {
  pass: "bg-pass",
  warn: "bg-advisory",
  fail: "bg-critical",
};

/** BR-08: high is red, medium and low are yellow. */
export const PRIORITY_TONE: Readonly<Record<SuggestionPriority, Tone>> = {
  high: "critical",
  medium: "advisory",
  low: "advisory",
};

export const PRIORITY_ORDER: Readonly<Record<SuggestionPriority, number>> = { high: 0, medium: 1, low: 2 };

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** StyleGuide §6: rubric rows and suggestion cards enter 0.05 s apart; reduced motion shows them at once. */
export function staggerVariants(reduceMotion: boolean): { list: Variants; item: Variants } {
  return {
    list: { hidden: {}, shown: { transition: { staggerChildren: reduceMotion ? 0 : 0.05 } } },
    item: {
      hidden: { opacity: 0, y: reduceMotion ? 0 : 6 },
      shown: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT } },
    },
  };
}
