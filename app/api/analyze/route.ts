import { clientIpFrom, defaultQuotaStore, runAnalysis } from "@/lib/api/analyze";
import { readConfig } from "@/lib/api/config";
import { ApiError, errorResponse, toApiError } from "@/lib/api/errors";
import { ANALYZE_FIELDS } from "@/types/api";

/** 20 s extraction + the 120 s AI budget + margin; fits Vercel Hobby with Fluid compute (300 s). */
export const maxDuration = 180;

/** Vercel refuses larger bodies before this code runs; self-hosted servers get the same cap here. */
const MAX_REQUEST_BYTES = 4_500_000;

function textField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
      throw new ApiError("PDF_TOO_LARGE");
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch (error) {
      throw new ApiError("INVALID_INPUT", { cause: error });
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
        authorization: request.headers.get("authorization"),
        clientIp: clientIpFrom(request.headers),
      },
      { config, quotaStore: defaultQuotaStore(config) },
    );
    return Response.json(result);
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.code === "INTERNAL_ERROR") {
      // Only the error name: messages can quote model output, which can quote the CV (BR-06).
      console.error("[api/analyze] unexpected error:", error instanceof Error ? error.name : typeof error);
    }
    return errorResponse(apiError);
  }
}
