import type { AnalysisMode, AtsCheck, Suggestion } from "./ats";

/** Timestamps are ISO 8601 UTC strings so the indexed fields sort chronologically. */
export interface CvEntity {
  id: number;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  rawText: string;
  sanitizedText: string;
  pageCount: number;
}

/** PDF bytes live apart from CvEntity so listing history never loads whole files. */
export interface CvFileEntity {
  cvId: number;
  pdfData: ArrayBuffer;
}

export interface ReviewEntity {
  id: number;
  cvId: number;
  mode: AnalysisMode;
  /** Null for Mode B. */
  targetJobTitle: string | null;
  /** Null for Mode B. */
  targetJobDescription: string | null;
  overallScore: number;
  atsChecks: AtsCheck[];
  weaknesses: string[];
  suggestions: Suggestion[];
  modelUsed: string;
  createdAt: string;
}

export interface JobMatchEntity {
  id: number;
  reviewId: number;
  cvId: number;
  jobTitle: string;
  matchScore: number;
  reason: string;
  keyStrengths: string[];
  missingSkills: string[];
  createdAt: string;
}

export const LOCAL_STORAGE_KEYS = {
  byokKey: "cv_ats_byok_key",
  byokModel: "cv_ats_byok_model",
  activeCvId: "cv_ats_active_cv_id",
} as const;

export interface ByokSettings {
  apiKey: string;
  /** Falls back to the server model chain when unset. */
  model?: string;
}
