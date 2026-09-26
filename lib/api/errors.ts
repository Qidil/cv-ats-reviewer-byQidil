import { PDF_ERROR_MESSAGES, PdfExtractionError } from "@/lib/pdf/types";
import type { ApiErrorCode, ApiErrorResponse } from "@/types/api";

interface ErrorSpec {
  status: number;
  message: string;
  retryable: boolean;
}

/** The single error catalog (api.md § Error Catalog). PDF messages come from lib/pdf/types.ts. */
export const API_ERRORS: Readonly<Record<ApiErrorCode, ErrorSpec>> = {
  INVALID_INPUT: {
    status: 400,
    retryable: false,
    message:
      "Data analisis tidak valid. Periksa file PDF, deskripsi pekerjaan (wajib untuk Mode A, maksimal 20.000 karakter), dan nama model di Pengaturan.",
  },
  PDF_TOO_LARGE: { status: 413, retryable: false, message: PDF_ERROR_MESSAGES.PDF_TOO_LARGE },
  PDF_INVALID: { status: 400, retryable: false, message: PDF_ERROR_MESSAGES.PDF_INVALID },
  PDF_PASSWORD_PROTECTED: { status: 422, retryable: false, message: PDF_ERROR_MESSAGES.PDF_PASSWORD_PROTECTED },
  PDF_TOO_MANY_PAGES: { status: 422, retryable: false, message: PDF_ERROR_MESSAGES.PDF_TOO_MANY_PAGES },
  PDF_NO_TEXT_FOUND: { status: 422, retryable: false, message: PDF_ERROR_MESSAGES.PDF_NO_TEXT_FOUND },
  PDF_TOO_COMPLEX: { status: 422, retryable: false, message: PDF_ERROR_MESSAGES.PDF_TOO_COMPLEX },
  AUTH_INVALID_KEY: {
    status: 401,
    retryable: false,
    message:
      "API key OpenRouter Anda ditolak. Periksa lagi di menu Pengaturan, atau hapus agar kembali memakai kunci bawaan.",
  },
  CREDITS_EXHAUSTED: {
    status: 402,
    retryable: false,
    message:
      "Saldo kredit OpenRouter untuk kunci yang dipakai habis atau minus. Pakai kunci lain di Pengaturan, atau tambah kredit di akun OpenRouter.",
  },
  CONTENT_BLOCKED: {
    status: 403,
    retryable: false,
    message:
      "Permintaan ditolak filter moderasi penyedia AI. Periksa isi CV atau deskripsi pekerjaan, lalu coba lagi.",
  },
  DAILY_QUOTA_EXCEEDED: {
    status: 429,
    retryable: false,
    message:
      "Kuota harian 10 analisis dengan kunci bawaan sudah habis. Coba lagi setelah pukul 00.00 WIB, atau pakai API key OpenRouter Anda sendiri.",
  },
  TOO_MANY_REQUESTS: {
    status: 429,
    retryable: true,
    message:
      "Jaringan Anda sudah mencapai batas analisis per jam, dengan kunci bawaan maupun API key sendiri. Coba lagi mulai jam berikutnya.",
  },
  RATE_LIMITED_429: {
    status: 429,
    retryable: true,
    message: "Semua model gratis sedang penuh. Coba lagi dalam 1 menit, atau pakai API key Anda sendiri.",
  },
  MODEL_UNAVAILABLE: {
    status: 502,
    retryable: true,
    message: "Model AI sedang tidak tersedia setelah semua model cadangan dicoba. Coba lagi beberapa saat lagi.",
  },
  TOKEN_LENGTH_EXCEEDED: {
    status: 502,
    retryable: true,
    message: "Jawaban AI terpotong karena terlalu panjang, termasuk setelah dilanjutkan model cadangan. Coba lagi.",
  },
  JSON_PARSE_FAILED: {
    status: 502,
    retryable: true,
    message: "Jawaban AI tidak bisa dibaca setelah dicoba ulang. Jalankan analisis sekali lagi.",
  },
  QUOTA_CHECK_FAILED: {
    status: 503,
    retryable: true,
    message:
      "Penghitung kuota harian sedang tidak bisa dihubungi. Coba lagi sebentar lagi, atau pakai API key OpenRouter Anda sendiri.",
  },
  SERVICE_NOT_CONFIGURED: {
    status: 503,
    retryable: false,
    message:
      "Analisis dengan kunci bawaan belum bisa dipakai karena pengaturan server belum lengkap. Pakai API key OpenRouter Anda sendiri di Pengaturan.",
  },
  NETWORK_TIMEOUT: {
    status: 504,
    retryable: true,
    message: "Analisis melebihi batas waktu 120 detik. Periksa koneksi internet, lalu coba lagi.",
  },
  INTERNAL_ERROR: {
    status: 500,
    retryable: true,
    message: "Terjadi kesalahan di server saat menganalisis CV. Coba lagi sebentar lagi.",
  },
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly resetsAt?: string;

  constructor(code: ApiErrorCode, options: { resetsAt?: string; cause?: unknown } = {}) {
    super(API_ERRORS[code].message, { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.resetsAt = options.resetsAt;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof PdfExtractionError) {
    return new ApiError(error.code, { cause: error });
  }
  return new ApiError("INTERNAL_ERROR", { cause: error });
}

export function errorBody(error: ApiError): ApiErrorResponse {
  const spec = API_ERRORS[error.code];
  return {
    error: {
      code: error.code,
      message: spec.message,
      retryable: spec.retryable,
      ...(error.resetsAt === undefined ? {} : { resetsAt: error.resetsAt }),
    },
  };
}

export function errorResponse(error: ApiError): Response {
  return Response.json(errorBody(error), { status: API_ERRORS[error.code].status });
}
