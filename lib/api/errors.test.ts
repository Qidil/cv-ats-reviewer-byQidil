import { describe, expect, it } from "vitest";
import { PDF_ERROR_CODES, PDF_ERROR_MESSAGES, PdfExtractionError } from "@/lib/pdf/types";
import { API_ERROR_CODES } from "@/types/api";
import { API_ERRORS, ApiError, errorBody, errorResponse, toApiError } from "./errors";

describe("error catalog", () => {
  it("gives every code an HTTP error status and an Indonesian message without em dashes", () => {
    for (const code of API_ERROR_CODES) {
      const spec = API_ERRORS[code];
      expect(spec.status).toBeGreaterThanOrEqual(400);
      expect(spec.status).toBeLessThan(600);
      expect(spec.message.length).toBeGreaterThan(20);
      expect(spec.message).not.toContain("\u2014");
    }
  });

  it("reuses the PDF messages from the extractor", () => {
    for (const code of PDF_ERROR_CODES) {
      expect(API_ERRORS[code].message).toBe(PDF_ERROR_MESSAGES[code]);
    }
  });

  it("includes resetsAt only when the error carries it", () => {
    expect(errorBody(new ApiError("DAILY_QUOTA_EXCEEDED", { resetsAt: "2026-09-27T00:00:00+07:00" }))).toEqual({
      error: {
        code: "DAILY_QUOTA_EXCEEDED",
        message: API_ERRORS.DAILY_QUOTA_EXCEEDED.message,
        retryable: false,
        resetsAt: "2026-09-27T00:00:00+07:00",
      },
    });
    expect(errorBody(new ApiError("NETWORK_TIMEOUT")).error).not.toHaveProperty("resetsAt");
  });

  it("sends the catalog status", async () => {
    const response = errorResponse(new ApiError("RATE_LIMITED_429"));

    expect(response.status).toBe(429);
    expect(((await response.json()) as { error: { retryable: boolean } }).error.retryable).toBe(true);
  });

  it("sends TOO_MANY_REQUESTS as a retryable 429 with the start of the next hour", async () => {
    const response = errorResponse(new ApiError("TOO_MANY_REQUESTS", { resetsAt: "2026-09-26T15:00:00+07:00" }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: {
        code: "TOO_MANY_REQUESTS",
        message: API_ERRORS.TOO_MANY_REQUESTS.message,
        retryable: true,
        resetsAt: "2026-09-26T15:00:00+07:00",
      },
    });
  });

  it("maps PDF errors, keeps API errors, and hides anything else behind INTERNAL_ERROR", () => {
    const apiError = new ApiError("CONTENT_BLOCKED");

    expect(toApiError(new PdfExtractionError("PDF_TOO_COMPLEX")).code).toBe("PDF_TOO_COMPLEX");
    expect(toApiError(apiError)).toBe(apiError);
    expect(toApiError(new TypeError("boom")).code).toBe("INTERNAL_ERROR");
    expect(toApiError("boom").message).toBe(API_ERRORS.INTERNAL_ERROR.message);
  });
});
