import { runModelChain } from "@/lib/ai/orchestrator";
import { parseAiReport, type AiReport } from "@/lib/ai/parser";
import { buildMessages, type PromptInput } from "@/lib/ai/prompts";
import {
  createMemoryStore,
  createUpstashStore,
  quotaKey,
  readQuota,
  recordAnalysis,
  recordRequest,
  requestKey,
  type QuotaStatus,
  type QuotaStore,
  type RequestWindow,
} from "@/lib/ai/quota";
import { composeReport } from "@/lib/ats/compose";
import { analyzeCv } from "@/lib/ats/rubric";
import { extractPdf } from "@/lib/pdf/extractor";
import { MAX_PDF_BYTES, type PdfExtraction } from "@/lib/pdf/types";
import type { AnalysisMode } from "@/types/ats";
import { ANALYSIS_MODES, type AnalyzeResponse, type AnalyzedDocument } from "@/types/api";
import type { AnalyzeConfig } from "./config";
import { ApiError } from "./errors";

/** P3-D5(b). */
export const MAX_JOB_DESCRIPTION_CHARS = 20_000;
export const MAX_JOB_TITLE_CHARS = 200;
const MAX_MODEL_NAME_CHARS = 200;
/** P3-D5(c). */
export const EXTRACTION_TIMEOUT_MS = 20_000;
/** Vercel refuses response bodies over 4.5 MB; the report and the rest of the JSON stay well under 0.5 MB. */
export const MAX_DOCUMENT_BYTES = 4_000_000;
/** Development without QUOTA_HASH_SECRET only; production refuses built-in-key analyses without it. */
const DEVELOPMENT_QUOTA_SECRET = "development-only-quota-secret";

export interface AnalyzeInput {
  file: Blob | null;
  mode: string | null;
  targetJobDescription: string | null;
  targetJobTitle: string | null;
  customModel: string | null;
  authorization: string | null;
  clientIp: string | null;
}

export interface AnalyzeDependencies {
  config: AnalyzeConfig;
  /** Null means no counter is available, which blocks built-in-key analyses. */
  quotaStore: QuotaStore | null;
  fetch?: typeof fetch;
  now?: () => number;
}

interface ValidInput {
  mode: AnalysisMode;
  file: Blob;
  jobDescription: string;
  jobTitle: string;
  customModel: string | null;
  personalKey: string | null;
}

interface BuiltInKey {
  apiKey: string;
  store: QuotaStore;
  counterKey: string;
}

function isMode(value: string | null): value is AnalysisMode {
  return value !== null && (ANALYSIS_MODES as readonly string[]).includes(value);
}

/** BR-10: "Bearer <key>" selects the personal key; any other Authorization value is a client bug. */
function readPersonalKey(authorization: string | null): string | null {
  if (authorization === null || authorization.trim() === "") {
    return null;
  }
  const match = authorization.match(/^Bearer\s+(\S+)\s*$/i);
  if (match === null) {
    throw new ApiError("INVALID_INPUT");
  }
  return match[1];
}

function validate(input: AnalyzeInput): ValidInput {
  if (!isMode(input.mode)) {
    throw new ApiError("INVALID_INPUT");
  }
  const jobDescription = input.mode === "mode-a" ? (input.targetJobDescription ?? "").trim() : "";
  const jobTitle = input.mode === "mode-a" ? (input.targetJobTitle ?? "").trim() : "";
  const customModel = (input.customModel ?? "").trim();
  if (
    (input.mode === "mode-a" && (jobDescription === "" || jobDescription.length > MAX_JOB_DESCRIPTION_CHARS)) ||
    jobTitle.length > MAX_JOB_TITLE_CHARS ||
    customModel.length > MAX_MODEL_NAME_CHARS ||
    !(input.file instanceof Blob) ||
    input.file.size === 0
  ) {
    throw new ApiError("INVALID_INPUT");
  }
  if (input.file.size > MAX_PDF_BYTES) {
    throw new ApiError("PDF_TOO_LARGE");
  }
  return {
    mode: input.mode,
    file: input.file,
    jobDescription,
    jobTitle,
    customModel: customModel === "" ? null : customModel,
    personalKey: readPersonalKey(input.authorization),
  };
}

function hashSecret(config: AnalyzeConfig): string | null {
  return config.quotaSecret ?? (config.production ? null : DEVELOPMENT_QUOTA_SECRET);
}

function builtInKey(deps: AnalyzeDependencies, clientIp: string | null, nowMs: number): BuiltInKey {
  const { config } = deps;
  const secret = hashSecret(config);
  if (config.serverApiKey === null || secret === null || deps.quotaStore === null) {
    throw new ApiError("SERVICE_NOT_CONFIGURED");
  }
  return {
    apiKey: config.serverApiKey,
    store: deps.quotaStore,
    counterKey: quotaKey(secret, clientIp ?? "unknown", nowMs),
  };
}

/**
 * rules.md §4.3.6: every valid request is counted per network and clock hour before extraction.
 * A missing store or secret, or a store outage, skips the limit: the built-in key cannot get this
 * far without a working store, and a personal key spends none of the owner's AI quota.
 */
async function limitRequests(deps: AnalyzeDependencies, clientIp: string | null, nowMs: number): Promise<void> {
  const secret = hashSecret(deps.config);
  if (deps.quotaStore === null || secret === null) {
    return;
  }
  let window: RequestWindow;
  try {
    window = await recordRequest(
      deps.quotaStore,
      requestKey(secret, clientIp ?? "unknown", nowMs),
      deps.config.hourlyRequestLimit,
      nowMs,
    );
  } catch {
    return;
  }
  if (!window.allowed) {
    throw new ApiError("TOO_MANY_REQUESTS", { resetsAt: window.resetsAt });
  }
}

const round = (value: number) => Math.round(value * 100) / 100;

function toDocument(extraction: PdfExtraction): AnalyzedDocument {
  return {
    pageCount: extraction.pageCount,
    source: extraction.source,
    pages: extraction.pages.map(({ pageNumber, box }) => ({ pageNumber, box })),
    runs: extraction.runs.map((run) => ({
      pageNumber: run.pageNumber,
      x: round(run.x),
      y: round(run.y),
      width: round(run.width),
      fontSize: round(run.fontSize),
      hidden: run.hidden,
      textStart: run.textStart,
      textEnd: run.textEnd,
    })),
    runsOmitted: false,
    rawText: extraction.rawText,
    sanitizedText: extraction.sanitizedText,
    visibleText: extraction.visibleText,
    hiddenText: extraction.metadata.hiddenText,
  };
}

const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

/**
 * Sized before the AI call, so a document too large to send never spends a model call or a quota
 * count. The runs are dropped first: without them the Inspector still has the text, only not the boxes.
 */
export function fitDocument(extraction: PdfExtraction, maxBytes: number = MAX_DOCUMENT_BYTES): AnalyzedDocument {
  const full = toDocument(extraction);
  if (jsonBytes(full) <= maxBytes) {
    return full;
  }
  const withoutRuns: AnalyzedDocument = { ...full, runs: [], runsOmitted: true };
  if (jsonBytes(withoutRuns) <= maxBytes) {
    return withoutRuns;
  }
  throw new ApiError("PDF_TOO_COMPLEX");
}

/**
 * The whole analysis for every mode in one request (P3-D3): quota check for the built-in key, the
 * hourly request limit, extraction, rubric, AI chain on visibleText only, merge, then one count on success.
 */
export async function runAnalysis(input: AnalyzeInput, deps: AnalyzeDependencies): Promise<AnalyzeResponse> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const request = validate(input);
  const { config } = deps;

  const builtIn = request.personalKey === null ? builtInKey(deps, input.clientIp, startedAt) : null;
  let before: QuotaStatus | null = null;
  if (builtIn !== null) {
    try {
      before = await readQuota(builtIn.store, builtIn.counterKey, config.dailyLimit, startedAt);
    } catch (error) {
      throw new ApiError("QUOTA_CHECK_FAILED", { cause: error });
    }
    if (before.remaining === 0) {
      throw new ApiError("DAILY_QUOTA_EXCEEDED", { resetsAt: before.resetsAt });
    }
  }
  await limitRequests(deps, input.clientIp, startedAt);

  const extraction = await extractPdf(new Uint8Array(await request.file.arrayBuffer()), {
    timeoutMs: EXTRACTION_TIMEOUT_MS,
  });
  const document = fitDocument(extraction);
  const deterministic = analyzeCv(extraction.visibleText, request.jobDescription, extraction.metadata);
  const promptInput: PromptInput = {
    mode: request.mode,
    cvText: extraction.visibleText,
    targetJobDescription: request.jobDescription,
    targetJobTitle: request.jobTitle,
  };
  const apiKey = request.personalKey ?? builtIn?.apiKey;
  if (apiKey === undefined) {
    throw new ApiError("SERVICE_NOT_CONFIGURED");
  }
  const firstModel = request.personalKey !== null && request.customModel !== null ? request.customModel : config.primaryModel;
  const chain = await runModelChain<AiReport>({
    apiKey,
    keyOwner: request.personalKey === null ? "server" : "user",
    models: [firstModel, ...config.fallbackModels.filter((model) => model !== firstModel)],
    budgetMs: config.budgetMs,
    buildMessages: (partialOutput) => buildMessages(promptInput, partialOutput),
    parse: (content) => parseAiReport(content, request.mode),
    fetch: deps.fetch,
    now,
  });
  const report = composeReport({ mode: request.mode, deterministic, ai: chain.result, extraction });

  let quota: QuotaStatus | null = null;
  if (builtIn !== null && before !== null) {
    try {
      quota = await recordAnalysis(builtIn.store, builtIn.counterKey, config.dailyLimit, now());
    } catch {
      // P3-D2: the analysis already succeeded, so a failed count must not discard it.
      quota = { ...before, used: before.used + 1, remaining: Math.max(0, before.remaining - 1) };
    }
  }

  return {
    mode: request.mode,
    ...report,
    document,
    meta: { modelUsed: chain.modelUsed, failoverOccurred: chain.failoverOccurred, latencyMs: now() - startedAt, quota },
  };
}

let developmentStore: QuotaStore | undefined;

/** P3-D2: Upstash when configured; an in-process counter outside production; nothing in production. */
export function defaultQuotaStore(config: AnalyzeConfig): QuotaStore | null {
  if (config.upstash !== null) {
    return createUpstashStore(config.upstash);
  }
  if (config.production) {
    return null;
  }
  developmentStore ??= createMemoryStore();
  return developmentStore;
}

/** T8: on Vercel both headers are set by the platform, so the client cannot spoof them. */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || null;
}
