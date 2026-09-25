import type { AtsCheck, SuggestedJob, Suggestion } from "./ats";

export interface AnalyzeRequest {
  cvText: string;
  /** Empty or missing runs the general review instead of Mode A. */
  targetJobDescription?: string;
  customModel?: string;
}

export interface AnalyzeMeta {
  modelUsed: string;
  failoverOccurred: boolean;
  latencyMs: number;
}

export interface AnalyzeResponse {
  overallScore: number;
  atsChecks: AtsCheck[];
  weaknesses: string[];
  suggestions: Suggestion[];
  meta: AnalyzeMeta;
}

export interface JobsRequest {
  cvText: string;
  customModel?: string;
}

export interface JobsMeta {
  modelUsed: string;
  latencyMs: number;
}

export interface JobsResponse {
  suggestedJobs: SuggestedJob[];
  meta: JobsMeta;
}

/** Canonical list: project-context/api.md § Error Catalog. */
export const API_ERROR_CODES = [
  "INVALID_INPUT",
  "AUTH_INVALID_KEY",
  "CREDITS_EXHAUSTED",
  "CONTENT_BLOCKED",
  "DAILY_QUOTA_EXCEEDED",
  "RATE_LIMITED_429",
  "MODEL_UNAVAILABLE",
  "TOKEN_LENGTH_EXCEEDED",
  "JSON_PARSE_FAILED",
  "NETWORK_TIMEOUT",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    /** Indonesian, safe to show to the user as-is. */
    message: string;
    retryable: boolean;
    /** Only for DAILY_QUOTA_EXCEEDED: when the built-in key can be used again (ISO 8601). */
    resetsAt?: string;
  };
}
