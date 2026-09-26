export const ATS_CHECK_IDS = [
  "keyword",
  "skills",
  "sections",
  "formatting",
  "quantified",
  "readability",
] as const;

export type AtsCheckId = (typeof ATS_CHECK_IDS)[number];

/** BR-03: weights per check, summing to 100. */
export const ATS_CHECK_WEIGHTS: Readonly<Record<AtsCheckId, number>> = {
  keyword: 40,
  skills: 20,
  sections: 15,
  formatting: 10,
  quantified: 10,
  readability: 5,
};

/** BR-04: pass at 80 and above, warn from 60 to 79, fail below 60. */
export const ATS_STATUS_THRESHOLDS = {
  pass: 80,
  warn: 60,
} as const;

export type AtsCheckStatus = "pass" | "warn" | "fail";

export interface AtsCheck {
  id: AtsCheckId;
  name: string;
  status: AtsCheckStatus;
  score: number;
  detail: string;
}

/** BR-08: high renders as a red highlight, medium and low as yellow. */
export type SuggestionPriority = "high" | "medium" | "low";

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: SuggestionPriority;
  /** Verbatim CV text used to place the highlight on the PDF preview. */
  targetTextSnippet?: string;
  /** 1-indexed. */
  pageNumber?: number;
}

export type AnalysisMode = "mode-a" | "mode-b";

/** FEAT-03 (AC-03.1): Mode B lists exactly this many roles, the best match first. */
export const SUGGESTED_JOB_COUNT = 5;

export interface SuggestedJob {
  title: string;
  matchScore: number;
  reason: string;
  keyStrengths: string[];
  missingSkills: string[];
}
