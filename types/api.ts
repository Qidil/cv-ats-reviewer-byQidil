import type { HiddenTextSummary, PdfBox } from "@/lib/pdf/types";
import type { AnalysisMode, AtsCheck, SuggestedJob, Suggestion } from "./ats";

/** Multipart field names of POST /api/analyze (api.md). */
export const ANALYZE_FIELDS = {
  file: "file",
  mode: "mode",
  targetJobDescription: "targetJobDescription",
  targetJobTitle: "targetJobTitle",
  customModel: "customModel",
} as const;

export const ANALYSIS_MODES: readonly AnalysisMode[] = ["mode-a", "mode-b"];

/** A text run's box in page space. Its text is `rawText.slice(textStart, textEnd)`, so it is not sent twice. */
export interface DocumentRun {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  hidden: boolean;
  textStart: number;
  textEnd: number;
}

export interface AnalyzedDocument {
  pageCount: number;
  source: "operator-list" | "text-content";
  pages: Array<{ pageNumber: number; box: PdfBox }>;
  /** Empty when `runsOmitted` is true. */
  runs: DocumentRun[];
  /** True when the runs would push the response past Vercel's 4.5 MB body limit. */
  runsOmitted: boolean;
  rawText: string;
  sanitizedText: string;
  visibleText: string;
  hiddenText: HiddenTextSummary;
}

export interface QuotaInfo {
  limit: number;
  used: number;
  remaining: number;
  /** ISO 8601 with the +07:00 offset (next 00:00 WIB). */
  resetsAt: string;
}

export interface AnalyzeMeta {
  /** The model ID requested from the chain, or the user's custom model. */
  modelUsed: string;
  failoverOccurred: boolean;
  latencyMs: number;
  /** Built-in key only; null when a personal key was used. */
  quota: QuotaInfo | null;
}

export interface AnalyzeResponse {
  mode: AnalysisMode;
  overallScore: number;
  atsChecks: AtsCheck[];
  weaknesses: string[];
  suggestions: Suggestion[];
  /** Mode B only; empty in Mode A. */
  suggestedJobs: SuggestedJob[];
  document: AnalyzedDocument;
  meta: AnalyzeMeta;
}

/** Canonical list: project-context/api.md § Error Catalog. */
export const API_ERROR_CODES = [
  "INVALID_INPUT",
  "PDF_TOO_LARGE",
  "PDF_INVALID",
  "PDF_PASSWORD_PROTECTED",
  "PDF_TOO_MANY_PAGES",
  "PDF_NO_TEXT_FOUND",
  "PDF_TOO_COMPLEX",
  "AUTH_INVALID_KEY",
  "CREDITS_EXHAUSTED",
  "CONTENT_BLOCKED",
  "DAILY_QUOTA_EXCEEDED",
  "TOO_MANY_REQUESTS",
  "RATE_LIMITED_429",
  "MODEL_UNAVAILABLE",
  "TOKEN_LENGTH_EXCEEDED",
  "JSON_PARSE_FAILED",
  "QUOTA_CHECK_FAILED",
  "SERVICE_NOT_CONFIGURED",
  "NETWORK_TIMEOUT",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    /** Indonesian, safe to show to the user as-is. */
    message: string;
    retryable: boolean;
    /** DAILY_QUOTA_EXCEEDED and TOO_MANY_REQUESTS only: when the limit resets (ISO 8601, +07:00). */
    resetsAt?: string;
  };
}
