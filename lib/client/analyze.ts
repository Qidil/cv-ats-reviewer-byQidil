import type { Language } from "@/lib/i18n/language";
import { ANALYZE_FIELDS, API_ERROR_CODES, type AnalyzeResponse, type ApiErrorCode } from "@/types/api";
import type { AnalysisMode } from "@/types/ats";
import type { PersonalKeySettings } from "./settings";

/** api.md § Client Handling Outside the Catalog: failures that never produce a catalog body. */
export type ClientFailure = "PAYLOAD_TOO_LARGE" | "SERVER_UNREACHABLE" | "NO_CONNECTION" | "UNREADABLE" | "KEY_UNSENDABLE";

export type AnalyzeOutcome =
  | { kind: "success"; response: AnalyzeResponse }
  | { kind: "api-error"; code: ApiErrorCode; message: string; retryable: boolean; resetsAt?: string }
  | { kind: "client-error"; failure: ClientFailure }
  | { kind: "cancelled" };

export interface AnalyzeRequest {
  file: Blob;
  fileName: string;
  mode: AnalysisMode;
  jobTitle: string;
  jobDescription: string;
  language: Language;
  /** A personal key and where it goes (BR-10, ADR-009); null uses the free quota. */
  personalKey: PersonalKeySettings | null;
}

export interface AnalyzeCallbacks {
  /** 0 to 1 while the PDF uploads. */
  onUploadProgress?: (fraction: number) => void;
  /** The upload finished; the server is now analyzing. */
  onUploaded?: () => void;
  signal?: AbortSignal;
}

/** A little past the route's maxDuration (180 s), so the server's own timeout answers first. */
const REQUEST_TIMEOUT_MS = 190_000;

function readCatalogError(text: string): Extract<AnalyzeOutcome, { kind: "api-error" }> | null {
  try {
    const body = JSON.parse(text) as { error?: Record<string, unknown> };
    const error = body.error;
    if (
      error &&
      typeof error.code === "string" &&
      (API_ERROR_CODES as readonly string[]).includes(error.code) &&
      typeof error.message === "string"
    ) {
      return {
        kind: "api-error",
        code: error.code as ApiErrorCode,
        message: error.message,
        retryable: error.retryable === true,
        ...(typeof error.resetsAt === "string" ? { resetsAt: error.resetsAt } : {}),
      };
    }
  } catch {
    // Not JSON: handled as a failure outside the catalog.
  }
  return null;
}

function readReport(text: string): AnalyzeResponse | null {
  try {
    const body = JSON.parse(text) as Partial<AnalyzeResponse>;
    return Array.isArray(body.atsChecks) && typeof body.overallScore === "number" && body.document && body.meta
      ? (body as AnalyzeResponse)
      : null;
  } catch {
    return null;
  }
}

export function buildAnalyzeForm(request: AnalyzeRequest): FormData {
  const form = new FormData();
  form.append(ANALYZE_FIELDS.file, request.file, request.fileName);
  form.append(ANALYZE_FIELDS.mode, request.mode);
  if (request.mode === "mode-a") {
    form.append(ANALYZE_FIELDS.targetJobDescription, request.jobDescription);
    if (request.jobTitle.trim() !== "") {
      form.append(ANALYZE_FIELDS.targetJobTitle, request.jobTitle);
    }
  }
  const key = request.personalKey;
  if (key !== null) {
    // The server recognizes the provider from the key itself (ADR-009).
    if (key.model.trim() !== "") {
      form.append(ANALYZE_FIELDS.customModel, key.model.trim());
    }
    if (key.baseUrl.trim() !== "") {
      form.append(ANALYZE_FIELDS.customBaseUrl, key.baseUrl.trim());
    }
  }
  return form;
}

/**
 * T7: XMLHttpRequest, because fetch cannot report upload progress in browsers. Always resolves;
 * every failure becomes an outcome the dashboard can show.
 */
export function sendAnalysis(
  request: AnalyzeRequest,
  callbacks: AnalyzeCallbacks = {},
  createRequest: () => XMLHttpRequest = () => new XMLHttpRequest(),
): Promise<AnalyzeOutcome> {
  return new Promise((resolve) => {
    if (callbacks.signal?.aborted) {
      resolve({ kind: "cancelled" });
      return;
    }
    const xhr = createRequest();
    const onAbortSignal = () => xhr.abort();
    const finish = (outcome: AnalyzeOutcome) => {
      callbacks.signal?.removeEventListener("abort", onAbortSignal);
      resolve(outcome);
    };

    xhr.open("POST", "/api/analyze");
    xhr.timeout = REQUEST_TIMEOUT_MS;
    try {
      xhr.setRequestHeader("Accept-Language", request.language);
      if (request.personalKey !== null) {
        xhr.setRequestHeader("Authorization", `Bearer ${request.personalKey.apiKey}`);
      }
    } catch {
      // G-03: a stored key with a character outside visible ASCII makes the browser throw here.
      resolve({ kind: "client-error", failure: "KEY_UNSENDABLE" });
      return;
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        callbacks.onUploadProgress?.(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.upload.onload = () => {
      callbacks.onUploadProgress?.(1);
      callbacks.onUploaded?.();
    };
    xhr.onload = () => {
      const text = typeof xhr.responseText === "string" ? xhr.responseText : "";
      if (xhr.status >= 200 && xhr.status < 300) {
        const report = readReport(text);
        finish(report ? { kind: "success", response: report } : { kind: "client-error", failure: "UNREADABLE" });
        return;
      }
      const catalog = readCatalogError(text);
      if (catalog) {
        finish(catalog);
      } else if (xhr.status === 413) {
        finish({ kind: "client-error", failure: "PAYLOAD_TOO_LARGE" });
      } else if (xhr.status === 502 || xhr.status === 503 || xhr.status === 504) {
        finish({ kind: "client-error", failure: "SERVER_UNREACHABLE" });
      } else {
        finish({ kind: "client-error", failure: "UNREADABLE" });
      }
    };
    xhr.onerror = () => finish({ kind: "client-error", failure: "NO_CONNECTION" });
    xhr.ontimeout = () => finish({ kind: "client-error", failure: "SERVER_UNREACHABLE" });
    xhr.onabort = () => finish({ kind: "cancelled" });
    callbacks.signal?.addEventListener("abort", onAbortSignal, { once: true });
    xhr.send(buildAnalyzeForm(request));
  });
}
