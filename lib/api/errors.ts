import { DEFAULT_LANGUAGE, type Language } from "@/lib/i18n/language";
import { PDF_ERROR_MESSAGES, PdfExtractionError } from "@/lib/pdf/types";
import type { ApiErrorCode, ApiErrorResponse } from "@/types/api";

interface ErrorSpec {
  status: number;
  message: Readonly<Record<Language, string>>;
  /** Replaces `message` when the failing request used a personal key, where the remedy differs. */
  personalKeyMessage?: Readonly<Record<Language, string>>;
  retryable: boolean;
}

/** The single error catalog (api.md § Error Catalog), English and Indonesian. PDF messages come from lib/pdf/types.ts. */
export const API_ERRORS: Readonly<Record<ApiErrorCode, ErrorSpec>> = {
  INVALID_INPUT: {
    status: 400,
    retryable: false,
    message: {
      en: "The analysis request is not valid. Check the PDF file and the job description (required when matching a job posting, up to 20,000 characters).",
      id: "Permintaan analisis tidak valid. Periksa file PDF dan deskripsi pekerjaan (wajib saat mencocokkan dengan lowongan, maksimal 20.000 karakter).",
    },
    personalKeyMessage: {
      en: "The analysis request is not valid. Check the PDF file, the job description (required when matching a job posting, up to 20,000 characters), and the model and endpoint address in Settings.",
      id: "Permintaan analisis tidak valid. Periksa file PDF, deskripsi pekerjaan (wajib saat mencocokkan dengan lowongan, maksimal 20.000 karakter), serta model dan alamat endpoint di Pengaturan.",
    },
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
    message: {
      en: "Your AI provider rejected this API key. Check it in Settings, or remove it to go back to the free quota.",
      id: "Provider AI Anda menolak API key ini. Periksa lagi di Pengaturan, atau hapus agar kembali memakai kuota gratis.",
    },
  },
  CREDITS_EXHAUSTED: {
    status: 402,
    retryable: false,
    message: {
      en: "The credit balance for this API key is used up or negative. Add credits with your provider, or use another key in Settings.",
      id: "Saldo kredit untuk API key ini habis atau minus. Tambah kredit di provider Anda, atau pakai kunci lain di Pengaturan.",
    },
  },
  CONTENT_BLOCKED: {
    status: 403,
    retryable: false,
    message: {
      en: "The AI provider's moderation filter blocked the request. Check the CV or the job description, then try again.",
      id: "Permintaan ditolak filter moderasi provider AI. Periksa isi CV atau deskripsi pekerjaan, lalu coba lagi.",
    },
  },
  DAILY_QUOTA_EXCEEDED: {
    status: 429,
    retryable: false,
    message: {
      en: "Today's free analyses are used up. Try again after 00:00 GMT+8, or use your own API key.",
      id: "Kuota analisis gratis hari ini sudah habis. Coba lagi setelah pukul 00.00 GMT+8, atau pakai API key Anda sendiri.",
    },
  },
  TOO_MANY_REQUESTS: {
    status: 429,
    retryable: true,
    message: {
      en: "Your network has reached the hourly analysis limit. The limit also applies to your own API key. Try again when the next hour starts.",
      id: "Jaringan Anda sudah mencapai batas analisis per jam. Batas ini juga berlaku untuk API key Anda sendiri. Coba lagi mulai jam berikutnya.",
    },
  },
  RATE_LIMITED_429: {
    status: 429,
    retryable: true,
    message: {
      en: "All free models are busy. Try again in a minute, or use your own API key.",
      id: "Semua model gratis sedang ramai. Coba lagi dalam 1 menit, atau pakai API key Anda sendiri.",
    },
    personalKeyMessage: {
      en: "Your AI provider is limiting requests for this key right now. Try again in a minute.",
      id: "Provider AI Anda sedang membatasi permintaan untuk kunci ini. Coba lagi dalam 1 menit.",
    },
  },
  MODEL_UNAVAILABLE: {
    status: 502,
    retryable: true,
    message: {
      en: "The AI model is not available right now. Try again in a few moments.",
      id: "Model AI sedang tidak tersedia. Coba lagi beberapa saat lagi.",
    },
  },
  TOKEN_LENGTH_EXCEEDED: {
    status: 502,
    retryable: true,
    message: {
      en: "The AI answer was cut off for length, even after it was continued. Try again.",
      id: "Jawaban AI terpotong karena terlalu panjang, bahkan setelah dilanjutkan. Coba lagi.",
    },
  },
  JSON_PARSE_FAILED: {
    status: 502,
    retryable: true,
    message: {
      en: "The AI answer could not be read, even after retrying. Run the analysis once more.",
      id: "Jawaban AI tidak bisa dibaca setelah dicoba ulang. Jalankan analisis sekali lagi.",
    },
  },
  QUOTA_CHECK_FAILED: {
    status: 503,
    retryable: true,
    message: {
      en: "The free quota counter cannot be reached right now. Try again shortly, or use your own API key.",
      id: "Penghitung kuota gratis sedang tidak bisa dihubungi. Coba lagi sebentar lagi, atau pakai API key Anda sendiri.",
    },
    personalKeyMessage: {
      en: "The request counter cannot be reached right now, so custom endpoints are paused. Try again shortly.",
      id: "Penghitung permintaan sedang tidak bisa dihubungi, jadi endpoint kustom dihentikan sementara. Coba lagi sebentar lagi.",
    },
  },
  SERVICE_NOT_CONFIGURED: {
    status: 503,
    retryable: false,
    message: {
      en: "The free quota is unavailable because the server setup is incomplete. Use your own API key in Settings.",
      id: "Kuota gratis belum bisa dipakai karena pengaturan server belum lengkap. Pakai API key Anda sendiri di Pengaturan.",
    },
    personalKeyMessage: {
      en: "This server cannot call custom endpoints because its request limit is not set up. Use a key from a provider the app recognizes, without an endpoint address.",
      id: "Server ini belum bisa memanggil endpoint kustom karena batas permintaannya belum diatur. Pakai kunci dari provider yang dikenali aplikasi, tanpa alamat endpoint.",
    },
  },
  NETWORK_TIMEOUT: {
    status: 504,
    retryable: true,
    message: {
      en: "The AI did not finish the analysis within 120 seconds. Try again in a moment.",
      id: "AI belum selesai menganalisis dalam 120 detik. Tunggu sebentar, lalu coba lagi.",
    },
  },
  INTERNAL_ERROR: {
    status: 500,
    retryable: true,
    message: {
      en: "Something went wrong on the server while analyzing the CV. Try again shortly.",
      id: "Terjadi kesalahan di server saat menganalisis CV. Coba lagi sebentar lagi.",
    },
  },
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly resetsAt?: string;
  /** Selects `personalKeyMessage` when the catalog entry has one. */
  readonly personalKey: boolean;

  constructor(
    code: ApiErrorCode,
    options: { resetsAt?: string; cause?: unknown; keyOwner?: "user" | "server" } = {},
  ) {
    super(API_ERRORS[code].message.en, { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.resetsAt = options.resetsAt;
    this.personalKey = options.keyOwner === "user";
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

export function errorBody(error: ApiError, language: Language = DEFAULT_LANGUAGE): ApiErrorResponse {
  const spec = API_ERRORS[error.code];
  const message = error.personalKey && spec.personalKeyMessage ? spec.personalKeyMessage : spec.message;
  return {
    error: {
      code: error.code,
      message: message[language],
      retryable: spec.retryable,
      ...(error.resetsAt === undefined ? {} : { resetsAt: error.resetsAt }),
    },
  };
}

export function errorResponse(error: ApiError, language: Language = DEFAULT_LANGUAGE): Response {
  return Response.json(errorBody(error, language), {
    status: API_ERRORS[error.code].status,
    headers: { "Content-Language": language },
  });
}
