import { runModelChain, type FetchLike } from "@/lib/ai/orchestrator";
import { parseAiReport, type AiReport } from "@/lib/ai/parser";
import { buildMessages, type PromptInput } from "@/lib/ai/prompts";
import { PROVIDERS } from "@/lib/ai/providers";
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
import { parseCustomBaseUrl, safeFetch } from "@/lib/ai/safe-fetch";
import { composeReport } from "@/lib/ats/compose";
import { analyzeCv } from "@/lib/ats/rubric";
import type { Language } from "@/lib/i18n/language";
import { extractPdf } from "@/lib/pdf/extractor";
import { renderPagePreviews, type PagePreview } from "@/lib/pdf/render";
import { MAX_PDF_BYTES, type PdfExtraction } from "@/lib/pdf/types";
import type { AnalysisMode } from "@/types/ats";
import {
  ANALYSIS_MODES,
  detectKeyProvider,
  type AnalyzeResponse,
  type AnalyzedDocument,
  type KeyProvider,
} from "@/types/api";
import type { AnalyzeConfig } from "./config";
import { ApiError } from "./errors";

/** P3-D5(b): request field caps. */
export const MAX_JOB_DESCRIPTION_CHARS = 20_000;
export const MAX_JOB_TITLE_CHARS = 200;
const MAX_MODEL_NAME_CHARS = 200;
/** P3-D5(c): extraction's share of the 180 s route. */
export const EXTRACTION_TIMEOUT_MS = 20_000;
/**
 * Vercel refuses response bodies over 4.5 MB. The document JSON gets this much, the page images
 * MAX_PREVIEW_BYTES, and the report stays far under 0.3 MB.
 */
export const MAX_DOCUMENT_BYTES = 1_800_000;
/** rules.md §3.4: base64 total for all page images. */
export const MAX_PREVIEW_BYTES = 2_000_000;
const PREVIEW_DEADLINE_MS = 15_000;
/** Development without QUOTA_HASH_SECRET only; production refuses built-in-key analyses without it. */
const DEVELOPMENT_QUOTA_SECRET = "development-only-quota-secret";

export interface AnalyzeInput {
  file: Blob | null;
  mode: string | null;
  targetJobDescription: string | null;
  targetJobTitle: string | null;
  customModel: string | null;
  /** ADR-009: a personal key's own endpoint address; without it the provider is recognized from the key. */
  customBaseUrl?: string | null;
  authorization: string | null;
  clientIp: string | null;
  /** From Accept-Language (BR-13): the language of the rubric text, the prompt, and the AI prose. */
  language: Language;
}

export interface AnalyzeDependencies {
  config: AnalyzeConfig;
  /** Null means no counter is available, which blocks built-in-key analyses. */
  quotaStore: QuotaStore | null;
  fetch?: FetchLike;
  /** The guarded fetch for custom endpoints; tests replace it. */
  customFetch?: FetchLike;
  now?: () => number;
  renderPreviews?: typeof renderPagePreviews;
}

interface ValidInput {
  mode: AnalysisMode;
  file: Blob;
  jobDescription: string;
  jobTitle: string;
  customModel: string | null;
  personalKey: string | null;
  /** Always "openrouter" without a personal key, so the built-in key never leaves OpenRouter. */
  provider: KeyProvider;
  baseUrl: string | null;
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
    throw new ApiError("INVALID_INPUT", { keyOwner: "user" });
  }
  return match[1];
}

function validate(input: AnalyzeInput): ValidInput {
  // G-18: only a personal key's owner has a model and an endpoint address in Settings to check.
  const keyOwner = input.authorization !== null && input.authorization.trim() !== "" ? "user" : "server";
  const invalid = () => new ApiError("INVALID_INPUT", { keyOwner });
  if (!isMode(input.mode)) {
    throw invalid();
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
    throw invalid();
  }
  if (input.file.size > MAX_PDF_BYTES) {
    throw new ApiError("PDF_TOO_LARGE");
  }
  const personalKey = readPersonalKey(input.authorization);
  let provider: KeyProvider = "openrouter";
  let baseUrl: string | null = null;
  if (personalKey !== null) {
    const address = (input.customBaseUrl ?? "").trim();
    if (address !== "") {
      // An address the user entered wins: a local or private server, or a provider the rules do not know.
      const url = parseCustomBaseUrl(address);
      if (url === null) {
        throw invalid();
      }
      provider = "custom";
      baseUrl = url.href;
    } else {
      // rules.md [FORBIDDEN]: a key the rules cannot place is refused, never sent on a guess.
      const detected = detectKeyProvider(personalKey, customModel);
      if (detected === null) {
        throw invalid();
      }
      provider = detected;
    }
    // BR-10: the free-model chain exists only on OpenRouter, so every other provider needs a model.
    if (provider !== "openrouter" && customModel === "") {
      throw invalid();
    }
  }
  return {
    mode: input.mode,
    file: input.file,
    jobDescription,
    jobTitle,
    customModel: customModel === "" ? null : customModel,
    personalKey,
    provider,
    baseUrl,
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
 * Without a store or secret, or during a store outage, the limit is skipped for the built-in key
 * (it cannot get this far without a working store) and for recognized providers (fixed addresses,
 * the user's own quota). DELTA-52: in production a custom endpoint is refused instead, because an
 * unlimited one would let anyone relay requests to any public host through this server.
 */
async function limitRequests(
  deps: AnalyzeDependencies,
  clientIp: string | null,
  nowMs: number,
  provider: KeyProvider,
): Promise<void> {
  const secret = hashSecret(deps.config);
  const required = provider === "custom" && deps.config.production;
  if (deps.quotaStore === null || secret === null) {
    if (required) {
      throw new ApiError("SERVICE_NOT_CONFIGURED", { keyOwner: "user" });
    }
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
  } catch (error) {
    if (required) {
      throw new ApiError("QUOTA_CHECK_FAILED", { cause: error, keyOwner: "user" });
    }
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
    pages: extraction.pages.map(({ pageNumber, box }) => ({ pageNumber, box, preview: null })),
    previewsOmitted: false,
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
 * count. The runs are dropped first: the text still arrives, only the boxes do not.
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

function withPreviews(document: AnalyzedDocument, previews: readonly PagePreview[]): AnalyzedDocument {
  const byPage = new Map(previews.map((preview) => [preview.pageNumber, preview]));
  const pages = document.pages.map((page) => {
    const preview = byPage.get(page.pageNumber);
    return {
      ...page,
      preview: preview
        ? { width: preview.width, height: preview.height, webp: Buffer.from(preview.webp).toString("base64") }
        : null,
    };
  });
  return { ...document, pages, previewsOmitted: pages.some((page) => page.preview === null) };
}

/**
 * One request per analysis (P3-D3): the quota is checked before any work and counted only on
 * success; the AI sees visibleText only.
 */
export async function runAnalysis(input: AnalyzeInput, deps: AnalyzeDependencies): Promise<AnalyzeResponse> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const request = validate(input);
  const { config } = deps;
  // Refused here as well, so a plain-HTTP address costs no extraction when the server does not allow it.
  if (request.baseUrl?.startsWith("http:") && !config.allowPrivateEndpoints) {
    throw new ApiError("INVALID_INPUT", { keyOwner: "user" });
  }

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
  await limitRequests(deps, input.clientIp, startedAt, request.provider);

  const pdfBytes = new Uint8Array(await request.file.arrayBuffer());
  const extraction = await extractPdf(pdfBytes, { timeoutMs: EXTRACTION_TIMEOUT_MS });
  const document = fitDocument(extraction);
  const deterministic = analyzeCv(extraction.visibleText, request.jobDescription, extraction.metadata, input.language);
  const promptInput: PromptInput = {
    mode: request.mode,
    language: input.language,
    cvText: extraction.visibleText,
    targetJobDescription: request.jobDescription,
    targetJobTitle: request.jobTitle,
  };
  const apiKey = request.personalKey ?? builtIn?.apiKey;
  if (apiKey === undefined) {
    throw new ApiError("SERVICE_NOT_CONFIGURED");
  }
  const firstModel = request.personalKey !== null && request.customModel !== null ? request.customModel : config.primaryModel;
  // ADR-009: another provider runs only the user's model, a second time only after a transient failure.
  const singleModel = request.personalKey !== null && request.provider !== "openrouter" ? request.customModel : null;
  // The chain starts first so its request is on the wire before rendering takes the thread.
  const chainPromise = runModelChain<AiReport>({
    apiKey,
    keyOwner: request.personalKey === null ? "server" : "user",
    provider: PROVIDERS[request.provider],
    baseUrl: request.baseUrl,
    models:
      singleModel !== null
        ? [singleModel, singleModel]
        : [firstModel, ...config.fallbackModels.filter((model) => model !== firstModel)],
    stopOnModelError: singleModel !== null,
    budgetMs: config.budgetMs,
    buildMessages: (partialOutput) => buildMessages(promptInput, partialOutput),
    parse: (content) => parseAiReport(content, request.mode, input.language),
    fetch:
      request.provider === "custom"
        ? (deps.customFetch ?? ((url, init) => safeFetch(url, init, { allowPrivate: config.allowPrivateEndpoints })))
        : deps.fetch,
    now,
  });
  const stopRendering = new AbortController();
  const previewsPromise = (deps.renderPreviews ?? renderPagePreviews)(pdfBytes, {
    budgetBytes: MAX_PREVIEW_BYTES,
    deadlineMs: PREVIEW_DEADLINE_MS,
    signal: stopRendering.signal,
  }).catch((): PagePreview[] => []);
  let chain: Awaited<typeof chainPromise>;
  try {
    chain = await chainPromise;
  } catch (error) {
    stopRendering.abort();
    throw error;
  }
  const previews = await previewsPromise;
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
    document: withPreviews(document, previews),
    meta: {
      modelUsed: chain.modelUsed,
      failoverOccurred: chain.failoverOccurred,
      continuationOccurred: chain.continuationOccurred,
      latencyMs: now() - startedAt,
      quota,
    },
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
