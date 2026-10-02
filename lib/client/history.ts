import { createStorage, type DoctorCvStorage } from "@/lib/db/storage";
import type { Language } from "@/lib/i18n/language";
import { highlightsFor, type PlacedHighlight } from "@/lib/pdf/highlighter";
import type { HiddenTextSummary } from "@/lib/pdf/types";
import type { AnalyzeResponse, DocumentRun } from "@/types/api";
import type { AnalysisMode, AtsCheck, SuggestedJob, Suggestion } from "@/types/ats";
import { LOCAL_STORAGE_KEYS, type CvEntity, type CvPageImage, type ReviewEntity } from "@/types/db";

/** One shape for a fresh response and for a stored analysis, so the result view renders either. */
export interface AnalysisView {
  /** Null while the result lives only in React state (IndexedDB blocked or full). */
  cvId: number | null;
  reviewId: number | null;
  fileName: string;
  fileSize: number;
  pageCount: number;
  mode: AnalysisMode;
  /** The language the texts were produced in (BR-13). */
  language: Language;
  targetJobTitle: string | null;
  overallScore: number;
  atsChecks: AtsCheck[];
  weaknesses: string[];
  suggestions: Suggestion[];
  jobs: SuggestedJob[];
  pages: CvPageImage[];
  /** Where each suggestion's snippet sits on the page images, by suggestion id; geometry only, never CV text. */
  highlights: Record<string, PlacedHighlight>;
  hiddenText: HiddenTextSummary;
  modelUsed: string;
  /** DELTA-51: shown as short notes under the result. */
  failoverOccurred: boolean;
  continuationOccurred: boolean;
  createdAt: string;
}

export interface AnalysisSource {
  file: Blob;
  fileName: string;
  mode: AnalysisMode;
  jobTitle: string;
  jobDescription: string;
  language: Language;
}

export function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
}

export function pagesFromResponse(response: AnalyzeResponse): CvPageImage[] {
  return response.document.pages.map((page) => ({
    pageNumber: page.pageNumber,
    box: page.box,
    rotation: page.rotation,
    image: page.preview
      ? { blob: base64ToBlob(page.preview.webp, "image/webp"), width: page.preview.width, height: page.preview.height }
      : null,
  }));
}

/** P5-T1: rawText is read here to place the boxes and goes no further than this call. */
function highlightsOf(
  rawText: string,
  runs: readonly DocumentRun[],
  suggestions: readonly Suggestion[],
  pages: readonly CvPageImage[],
): Record<string, PlacedHighlight> {
  return highlightsFor(
    { rawText, runs },
    suggestions,
    pages.map((page) => ({
      pageNumber: page.pageNumber,
      box: page.box,
      rotation: page.rotation ?? 0,
      image: page.image ? { width: page.image.width, height: page.image.height } : null,
    })),
  );
}

export function viewFromResponse(
  response: AnalyzeResponse,
  source: AnalysisSource,
  pages: CvPageImage[],
  ids: { cvId: number; reviewId: number } | null,
  createdAt: string,
): AnalysisView {
  return {
    cvId: ids?.cvId ?? null,
    reviewId: ids?.reviewId ?? null,
    fileName: source.fileName,
    fileSize: source.file.size,
    pageCount: response.document.pageCount,
    mode: response.mode,
    language: source.language,
    targetJobTitle: response.mode === "mode-a" && source.jobTitle.trim() !== "" ? source.jobTitle.trim() : null,
    overallScore: response.overallScore,
    atsChecks: response.atsChecks,
    weaknesses: response.weaknesses,
    suggestions: response.suggestions,
    jobs: response.suggestedJobs,
    pages,
    highlights: highlightsOf(response.document.rawText, response.document.runs, response.suggestions, pages),
    hiddenText: response.document.hiddenText,
    modelUsed: response.meta.modelUsed,
    failoverOccurred: response.meta.failoverOccurred,
    continuationOccurred: response.meta.continuationOccurred,
    createdAt,
  };
}

/**
 * Integrity Rule 1: a first analysis stores the CV, its PDF, and its pages with the review; a new
 * analysis of a stored CV adds only the review and its job matches.
 */
export async function saveAnalysisResult(
  storage: DoctorCvStorage,
  input: { response: AnalyzeResponse; source: AnalysisSource; pages: CvPageImage[]; existingCvId: number | null; now: string },
): Promise<{ cvId: number; reviewId: number }> {
  const { response, source, pages, existingCvId, now } = input;
  const document = response.document;
  return storage.saveAnalysis({
    ...(existingCvId !== null
      ? { cvId: existingCvId }
      : {
          cv: {
            fileName: source.fileName,
            fileSize: source.file.size,
            uploadedAt: now,
            pageCount: document.pageCount,
            rawText: document.rawText,
            sanitizedText: document.sanitizedText,
            visibleText: document.visibleText,
            source: document.source,
            hiddenText: document.hiddenText,
            pdfData: await source.file.arrayBuffer(),
            pages,
            runs: document.runs,
            runsOmitted: document.runsOmitted,
          },
        }),
    review: {
      mode: response.mode,
      targetJobTitle: response.mode === "mode-a" ? source.jobTitle.trim() || null : null,
      targetJobDescription: response.mode === "mode-a" ? source.jobDescription.trim() || null : null,
      overallScore: response.overallScore,
      atsChecks: response.atsChecks,
      weaknesses: response.weaknesses,
      suggestions: response.suggestions,
      modelUsed: response.meta.modelUsed,
      failoverOccurred: response.meta.failoverOccurred,
      continuationOccurred: response.meta.continuationOccurred,
      language: source.language,
      createdAt: now,
    },
    jobMatches: response.suggestedJobs.map((job) => ({
      jobTitle: job.title,
      matchScore: job.matchScore,
      reason: job.reason,
      keyStrengths: job.keyStrengths,
      missingSkills: job.missingSkills,
      createdAt: now,
    })),
  });
}

/** The latest review of a CV, or the named one, as a view; null when the CV is gone. */
export async function loadStoredAnalysis(
  storage: DoctorCvStorage,
  cvId: number,
  reviewId?: number,
): Promise<AnalysisView | null> {
  const [cv, reviews, pages] = await Promise.all([
    storage.getCvById(cvId),
    storage.getReviewsByCvId(cvId),
    storage.getCvPages(cvId),
  ]);
  const review = reviewId === undefined ? reviews[0] : reviews.find((item) => item.id === reviewId);
  if (!cv || !review) {
    return null;
  }
  const matches = await storage.getJobMatchesByReviewId(review.id);
  return {
    cvId,
    reviewId: review.id,
    fileName: cv.fileName,
    fileSize: cv.fileSize,
    pageCount: cv.pageCount,
    mode: review.mode,
    language: review.language,
    targetJobTitle: review.targetJobTitle,
    overallScore: review.overallScore,
    atsChecks: review.atsChecks,
    weaknesses: review.weaknesses,
    suggestions: review.suggestions,
    jobs: matches.map((match) => ({
      title: match.jobTitle,
      matchScore: match.matchScore,
      reason: match.reason,
      keyStrengths: match.keyStrengths,
      missingSkills: match.missingSkills,
    })),
    pages: pages?.pages ?? [],
    highlights: highlightsOf(cv.rawText, pages?.runs ?? [], review.suggestions, pages?.pages ?? []),
    hiddenText: cv.hiddenText,
    modelUsed: review.modelUsed,
    failoverOccurred: review.failoverOccurred ?? false,
    continuationOccurred: review.continuationOccurred ?? false,
    createdAt: review.createdAt,
  };
}

export interface HistoryEntry {
  cv: CvEntity;
  latest: ReviewEntity | null;
}

export async function listHistory(storage: DoctorCvStorage): Promise<HistoryEntry[]> {
  const cvs = await storage.getAllCvs();
  return Promise.all(
    cvs.map(async (cv) => ({ cv, latest: (await storage.getReviewsByCvId(cv.id))[0] ?? null })),
  );
}

/** Null when the browser blocks IndexedDB (private modes); the dashboard then keeps results in React state. */
export async function openBrowserStorage(): Promise<DoctorCvStorage | null> {
  try {
    // G-16: Dexie arrives with the first storage access instead of with the page.
    const { getDb } = await import("@/lib/db/dexie");
    const db = getDb();
    await db.open();
    return createStorage(db);
  } catch {
    return null;
  }
}

export function isStorageFull(error: unknown): boolean {
  const names = [error, (error as { inner?: unknown } | null)?.inner].map((item) =>
    item !== null && typeof item === "object" ? (item as { name?: unknown }).name : undefined,
  );
  return names.includes("QuotaExceededError");
}

export function readActiveCvId(): number | null {
  try {
    const value = Number(window.localStorage.getItem(LOCAL_STORAGE_KEYS.activeCvId));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeActiveCvId(cvId: number | null): void {
  try {
    if (cvId === null) {
      window.localStorage.removeItem(LOCAL_STORAGE_KEYS.activeCvId);
    } else {
      window.localStorage.setItem(LOCAL_STORAGE_KEYS.activeCvId, String(cvId));
    }
  } catch {
    // Remembering the active CV is a convenience; private modes may refuse it.
  }
}
