import type { Language } from "@/lib/i18n/language";
import type { HiddenTextSummary, PdfBox } from "@/lib/pdf/types";
import type { AnalysisMode, AtsCheck, Suggestion } from "./ats";
import type { DocumentRun } from "./api";

/** Timestamps are ISO 8601 UTC strings so the indexed fields sort chronologically. */
export interface CvEntity {
  id: number;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  pageCount: number;
  /** Hidden text included; stored for debugging and never rendered. */
  rawText: string;
  /** Hidden text in [IGNORED] blocks; never sent to the AI and never rendered. */
  sanitizedText: string;
  /** The only CV text the interface may show. */
  visibleText: string;
  source: "operator-list" | "text-content";
  hiddenText: HiddenTextSummary;
}

/** PDF bytes live apart from CvEntity so listing history never loads whole files. */
export interface CvFileEntity {
  cvId: number;
  pdfData: ArrayBuffer;
}

export interface CvPageImage {
  pageNumber: number;
  box: PdfBox;
  /** The server-rendered WebP (ADR-004); null when the server sent none. */
  image: { blob: Blob; width: number; height: number } | null;
}

/** Everything the page preview and snippet highlights need; read only when a CV is opened. */
export interface CvPagesEntity {
  cvId: number;
  pages: CvPageImage[];
  runs: DocumentRun[];
  runsOmitted: boolean;
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
  /** DELTA-51: absent on reviews saved before the model notes, which reads as false. */
  failoverOccurred?: boolean;
  continuationOccurred?: boolean;
  /** BR-13: the language the texts were produced in; switching the interface does not change it. */
  language: Language;
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
  /** The provider is recognized from the key (ADR-009), so it is not stored. */
  byokKey: "cv_ats_byok_key",
  byokModel: "cv_ats_byok_model",
  byokBaseUrl: "cv_ats_byok_base_url",
  activeCvId: "cv_ats_active_cv_id",
} as const;
