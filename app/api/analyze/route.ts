import { clientIpFrom, defaultQuotaStore, runAnalysis } from "@/lib/api/analyze";
import { readConfig } from "@/lib/api/config";
import { ApiError, errorResponse, toApiError } from "@/lib/api/errors";
import { negotiateLanguage } from "@/lib/i18n/language";
import { ANALYZE_FIELDS } from "@/types/api";

/** 20 s extraction + the 120 s AI budget + margin; fits Vercel Hobby with Fluid compute (300 s). */
export const maxDuration = 180;

/** Vercel refuses larger bodies before this code runs; self-hosted servers get the same cap here. */
const MAX_REQUEST_BYTES = 4_500_000;

function textField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
}

/** Pages cannot set X-Forwarded-Host on a cross-site request: it needs a CORS preflight this route never approves. */
function requestHost(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("host") || new URL(request.url).host;
}

/**
 * rules.md §5.5: another page could otherwise make its visitors' browsers post analyses here and spend
 * their free quota and the owner's OpenRouter allowance. Sec-Fetch-Site is computed by the browser, and
 * Origin covers browsers that do not send it. Without either header, no browser sent the request.
 */
function isFromAnotherSite(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) {
    return fetchSite === "cross-site" || fetchSite === "same-site";
  }
  const origin = request.headers.get("origin");
  if (origin === null) {
    return false;
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  return originHost.toLowerCase() !== requestHost(request).toLowerCase();
}

/** rules.md §3.1: counted as it arrives, so a chunked body sent without Content-Length is capped too. */
async function readBody(request: Request): Promise<Blob> {
  if (request.body === null) {
    return new Blob();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return new Blob(chunks);
    }
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      // Stops the upload instead of draining it; the answer is the same if cancelling fails.
      await reader.cancel().catch(() => undefined);
      throw new ApiError("PDF_TOO_LARGE");
    }
    chunks.push(value);
  }
}

export async function POST(request: Request): Promise<Response> {
  // BR-13: decided first, so even an error raised before the form is read speaks the user's language.
  const language = negotiateLanguage(request.headers.get("accept-language"));
  try {
    if (isFromAnotherSite(request)) {
      throw new ApiError("INVALID_INPUT");
    }
    if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
      throw new ApiError("PDF_TOO_LARGE");
    }
    let form: FormData;
    try {
      const body = await readBody(request);
      const headers = { "content-type": request.headers.get("content-type") ?? "" };
      form = await new Response(body, { headers }).formData();
    } catch (error) {
      throw error instanceof ApiError ? error : new ApiError("INVALID_INPUT", { cause: error });
    }
    const config = readConfig();
    const file = form.get(ANALYZE_FIELDS.file);
    const result = await runAnalysis(
      {
        file: file instanceof Blob ? file : null,
        mode: textField(form, ANALYZE_FIELDS.mode),
        targetJobDescription: textField(form, ANALYZE_FIELDS.targetJobDescription),
        targetJobTitle: textField(form, ANALYZE_FIELDS.targetJobTitle),
        customModel: textField(form, ANALYZE_FIELDS.customModel),
        customBaseUrl: textField(form, ANALYZE_FIELDS.customBaseUrl),
        authorization: request.headers.get("authorization"),
        clientIp: clientIpFrom(request.headers),
        language,
      },
      { config, quotaStore: defaultQuotaStore(config) },
    );
    return Response.json(result, { headers: { "Content-Language": language } });
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.code === "INTERNAL_ERROR") {
      // Only the error name: messages can quote model output, which can quote the CV (BR-06).
      console.error("[api/analyze] unexpected error:", error instanceof Error ? error.name : typeof error);
    }
    return errorResponse(apiError, language);
  }
}
