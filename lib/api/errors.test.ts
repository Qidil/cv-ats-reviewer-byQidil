import { describe, expect, it } from "vitest";
import { LANGUAGES } from "@/lib/i18n/language";
import { PDF_ERROR_CODES, PDF_ERROR_MESSAGES, PdfExtractionError } from "@/lib/pdf/types";
import { API_ERROR_CODES } from "@/types/api";
import { API_ERRORS, ApiError, errorBody, errorResponse, toApiError } from "./errors";

describe("error catalog", () => {
  it("gives every code an HTTP error status and a message in each language without em dashes", () => {
    for (const code of API_ERROR_CODES) {
      const spec = API_ERRORS[code];
      expect(spec.status).toBeGreaterThanOrEqual(400);
      expect(spec.status).toBeLessThan(600);
      for (const language of LANGUAGES) {
        expect(spec.message[language].length).toBeGreaterThan(20);
        expect(spec.message[language]).not.toContain("\u2014");
      }
      expect(spec.message.en).not.toBe(spec.message.id);
    }
  });

  it("reuses the PDF messages from the extractor", () => {
    for (const code of PDF_ERROR_CODES) {
      expect(API_ERRORS[code].message).toBe(PDF_ERROR_MESSAGES[code]);
    }
  });

  it("keeps internal terms out of the messages", () => {
    for (const code of API_ERROR_CODES) {
      for (const language of LANGUAGES) {
        expect(API_ERRORS[code].message[language]).not.toMatch(/Mode [AB]|kunci bawaan|built-in key|\b10 analisis\b/);
      }
    }
  });

  it("includes resetsAt only when the error carries it, in English by default", () => {
    expect(errorBody(new ApiError("DAILY_QUOTA_EXCEEDED", { resetsAt: "2026-09-27T00:00:00+08:00" }))).toEqual({
      error: {
        code: "DAILY_QUOTA_EXCEEDED",
        message: API_ERRORS.DAILY_QUOTA_EXCEEDED.message.en,
        retryable: false,
        resetsAt: "2026-09-27T00:00:00+08:00",
      },
    });
    expect(errorBody(new ApiError("NETWORK_TIMEOUT")).error).not.toHaveProperty("resetsAt");
  });

  it.each(["INVALID_INPUT", "QUOTA_CHECK_FAILED", "SERVICE_NOT_CONFIGURED", "RATE_LIMITED_429"] as const)(
    "words %s for the key that was sent, in both languages (G-18, DELTA-52)",
    (code) => {
      const personal = API_ERRORS[code].personalKeyMessage;
      expect(personal).toBeDefined();
      for (const language of LANGUAGES) {
        expect(errorBody(new ApiError(code, { keyOwner: "user" }), language).error.message).toBe(personal?.[language]);
        expect(errorBody(new ApiError(code), language).error.message).toBe(API_ERRORS[code].message[language]);
        expect(personal?.[language]).not.toContain("\u2014");
      }
    },
  );

  it("sends the free-quota user no Settings fields to check on an invalid request (G-18)", () => {
    expect(API_ERRORS.INVALID_INPUT.message.en).not.toMatch(/Settings/);
    expect(API_ERRORS.INVALID_INPUT.message.id).not.toMatch(/Pengaturan/);
    expect(API_ERRORS.NETWORK_TIMEOUT.message.en).not.toMatch(/internet/);
  });

  it("sends the catalog status", async () => {
    const response = errorResponse(new ApiError("RATE_LIMITED_429"));

    expect(response.status).toBe(429);
    expect(((await response.json()) as { error: { retryable: boolean } }).error.retryable).toBe(true);
  });

  it("answers in the requested language and names it (BR-13)", async () => {
    const response = errorResponse(new ApiError("PDF_INVALID"), "id");

    expect(response.headers.get("content-language")).toBe("id");
    expect(((await response.json()) as { error: { message: string } }).error.message).toBe(PDF_ERROR_MESSAGES.PDF_INVALID.id);
    expect(errorResponse(new ApiError("PDF_INVALID")).headers.get("content-language")).toBe("en");
  });

  it("sends TOO_MANY_REQUESTS as a retryable 429 with the start of the next hour", async () => {
    const response = errorResponse(new ApiError("TOO_MANY_REQUESTS", { resetsAt: "2026-09-26T15:00:00+08:00" }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: {
        code: "TOO_MANY_REQUESTS",
        message: API_ERRORS.TOO_MANY_REQUESTS.message.en,
        retryable: true,
        resetsAt: "2026-09-26T15:00:00+08:00",
      },
    });
  });

  it("maps PDF errors, keeps API errors, and hides anything else behind INTERNAL_ERROR", () => {
    const apiError = new ApiError("CONTENT_BLOCKED");

    expect(toApiError(new PdfExtractionError("PDF_TOO_COMPLEX")).code).toBe("PDF_TOO_COMPLEX");
    expect(toApiError(apiError)).toBe(apiError);
    expect(toApiError(new TypeError("boom")).code).toBe("INTERNAL_ERROR");
    expect(toApiError("boom").message).toBe(API_ERRORS.INTERNAL_ERROR.message.en);
  });
});
