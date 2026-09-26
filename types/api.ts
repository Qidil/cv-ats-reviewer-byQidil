import type { HiddenTextSummary, PdfBox } from "@/lib/pdf/types";
import type { AnalysisMode, AtsCheck, SuggestedJob, Suggestion } from "./ats";

/** Multipart field names of POST /api/analyze (api.md). */
export const ANALYZE_FIELDS = {
  file: "file",
  mode: "mode",
  targetJobDescription: "targetJobDescription",
  targetJobTitle: "targetJobTitle",
  customModel: "customModel",
  customBaseUrl: "customBaseUrl",
} as const;

export const ANALYSIS_MODES: readonly AnalysisMode[] = ["mode-a", "mode-b"];

/**
 * ADR-009: where a personal key can go. `custom` is an address the user entered; every other one has
 * a fixed address. The built-in key is always an OpenRouter key.
 */
export const KEY_PROVIDERS = [
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "groq",
  "mistral",
  "deepseek",
  "xai",
  "perplexity",
  "fireworks",
  "cerebras",
  "huggingface",
  "nvidia",
  "custom",
] as const;

export type KeyProvider = (typeof KEY_PROVIDERS)[number];
export type KnownProvider = Exclude<KeyProvider, "custom">;

/** Distinct key prefixes, longest first where one prefix starts another (sk-or-, sk-ant- before sk-). */
const KEY_PREFIXES: ReadonlyArray<readonly [string, KnownProvider]> = [
  ["sk-or-", "openrouter"],
  ["sk-ant-", "anthropic"],
  ["sk-proj-", "openai"],
  ["sk-svcacct-", "openai"],
  ["AIza", "google"],
  ["gsk_", "groq"],
  ["xai-", "xai"],
  ["pplx-", "perplexity"],
  ["fw_", "fireworks"],
  ["csk-", "cerebras"],
  ["hf_", "huggingface"],
  ["nvapi-", "nvidia"],
];

/**
 * api.md § Personal-Key Providers: the provider a personal key belongs to, from its prefix or, for a
 * generic `sk-` key or a key without a prefix, from the model family. Null when unsure, because a
 * guess would hand the key to a provider it does not belong to.
 */
export function detectKeyProvider(apiKey: string, model: string): KnownProvider | null {
  const key = apiKey.trim();
  // An org/model ID comes from an aggregator's catalog (G-04), so its family says nothing about who issued the key.
  const family = model.includes("/") ? "" : model.trim().toLowerCase();
  for (const [prefix, provider] of KEY_PREFIXES) {
    if (key.startsWith(prefix)) {
      return provider;
    }
  }
  // OpenAI and DeepSeek both issue plain sk- keys, so only the model tells them apart.
  if (key.startsWith("sk-")) {
    if (family.startsWith("deepseek")) return "deepseek";
    if (/^(gpt-|o\d|chatgpt-|codex-)/.test(family)) return "openai";
    return null;
  }
  // Mistral keys carry no prefix.
  if (/^(mistral|codestral|magistral|ministral|pixtral|devstral|voxtral|open-mistral|open-mixtral)/.test(family)) {
    return "mistral";
  }
  return null;
}

/** rules.md §5.4: limits of a custom endpoint address. */
export const MAX_BASE_URL_CHARS = 300;

/**
 * The address format rules for a custom endpoint, shared by Settings and the server. Which hosts may
 * be reached, and whether plain HTTP is allowed, the server decides when it connects (lib/ai/safe-fetch.ts).
 */
export function parseCustomBaseUrl(raw: string | null): URL | null {
  const value = (raw ?? "").trim();
  // URL drops an empty "?" or "#", so they are refused on the raw text.
  if (value === "" || value.length > MAX_BASE_URL_CHARS || /[?#]/.test(value)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username !== "" || url.password !== "" || url.hostname === "") {
    return null;
  }
  return url;
}

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

/** A WebP page image in base64, with its pixel size (ADR-004). */
export interface PagePreviewImage {
  width: number;
  height: number;
  webp: string;
}

export interface AnalyzedDocument {
  pageCount: number;
  source: "operator-list" | "text-content";
  pages: Array<{ pageNumber: number; box: PdfBox; preview: PagePreviewImage | null }>;
  /** True when at least one page has no image (budget, deadline, or render failure). */
  previewsOmitted: boolean;
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
  /** ISO 8601 with the +08:00 offset (next 00:00 GMT+8, DELTA-50). */
  resetsAt: string;
}

export interface AnalyzeMeta {
  /** The model ID requested from the chain, or the user's custom model. */
  modelUsed: string;
  /** DELTA-51: a model other than the first in the chain wrote the result. */
  failoverOccurred: boolean;
  /** DELTA-51: the result continued a cut-off answer. */
  continuationOccurred: boolean;
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
    /** In the response language (Accept-Language, BR-13), safe to show to the user as-is. */
    message: string;
    retryable: boolean;
    /** DAILY_QUOTA_EXCEEDED and TOO_MANY_REQUESTS only: when the limit resets (ISO 8601, +08:00). */
    resetsAt?: string;
  };
}
