import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CvAtsDatabase } from "@/lib/db/dexie";
import { createStorage, type CvAtsStorage } from "@/lib/db/storage";
import type { AnalyzeResponse } from "@/types/api";
import {
  base64ToBlob,
  isStorageFull,
  listHistory,
  loadStoredAnalysis,
  pagesFromResponse,
  saveAnalysisResult,
  viewFromResponse,
  type AnalysisSource,
} from "./history";

let db: CvAtsDatabase;
let storage: CvAtsStorage;

beforeEach(() => {
  db = new CvAtsDatabase("history-test", { indexedDB: new IDBFactory(), IDBKeyRange });
  storage = createStorage(db);
});

afterEach(() => {
  db.close();
});

const WEBP = btoa("RIFF....WEBPVP8 ");

function response(mode: "mode-a" | "mode-b" = "mode-b"): AnalyzeResponse {
  return {
    mode,
    overallScore: 72,
    atsChecks: [{ id: "keyword", name: "Keyword Match", status: "warn", score: 65, detail: "Two terms are missing." }],
    weaknesses: ["One bullet has no number."],
    suggestions: [
      {
        id: "sug-01",
        title: "Add numbers",
        description: "Rewrite the bullet with a result.",
        category: "achievements",
        priority: "medium",
        targetTextSnippet: "Menulis dokumentasi teknis.",
        pageNumber: 1,
      },
    ],
    suggestedJobs:
      mode === "mode-b"
        ? [
            { title: "UI Engineer", matchScore: 64, reason: "React work.", keyStrengths: ["React"], missingSkills: ["Figma"] },
            { title: "Backend Engineer", matchScore: 82, reason: "API work.", keyStrengths: ["TypeScript"], missingSkills: ["Go"] },
          ]
        : [],
    document: {
      pageCount: 2,
      source: "operator-list",
      pages: [
        { pageNumber: 1, box: { x0: 0, y0: 0, x1: 612, y1: 792 }, rotation: 0, preview: { width: 1240, height: 1605, webp: WEBP } },
        { pageNumber: 2, box: { x0: 0, y0: 0, x1: 612, y1: 792 }, rotation: 0, preview: null },
      ],
      previewsOmitted: true,
      runs: [{ pageNumber: 1, x: 72, y: 740, width: 80, fontSize: 11, hidden: false, textStart: 0, textEnd: 12 }],
      runsOmitted: false,
      rawText: "Budi Santoso\n...",
      sanitizedText: "Budi Santoso\n...",
      visibleText: "Budi Santoso\n...",
      hiddenText: { checked: true, runCount: 0, charCount: 0, hasWords: false, reasons: [], samples: [] },
    },
    meta: { modelUsed: "openrouter/free", failoverOccurred: false, continuationOccurred: false, latencyMs: 9800, quota: null },
  };
}

const SOURCE: AnalysisSource = {
  file: new Blob(["%PDF-1.4 test"], { type: "application/pdf" }),
  fileName: "cv-budi-santoso.pdf",
  mode: "mode-b",
  jobTitle: "",
  jobDescription: "",
  language: "en",
};

describe("page images", () => {
  it("turns base64 WebP into Blobs and keeps pages without an image as null", async () => {
    const pages = pagesFromResponse(response());

    expect(pages[0].image).toMatchObject({ width: 1240, height: 1605 });
    expect(pages[0].image?.blob.type).toBe("image/webp");
    expect(await pages[0].image?.blob.text()).toBe("RIFF....WEBPVP8 ");
    expect(pages[1].image).toBeNull();
    expect(base64ToBlob(btoa("abc"), "text/plain").size).toBe(3);
  });
});

describe("saving and reopening an analysis", () => {
  it("stores a first analysis with its PDF, pages, review, language, and jobs, then reopens it", async () => {
    const pages = pagesFromResponse(response());
    const now = "2026-09-26T08:00:00.000Z";
    const ids = await saveAnalysisResult(storage, { response: response(), source: SOURCE, pages, existingCvId: null, now });

    const view = await loadStoredAnalysis(storage, ids.cvId);

    expect(view).toMatchObject({
      cvId: ids.cvId,
      reviewId: ids.reviewId,
      fileName: "cv-budi-santoso.pdf",
      mode: "mode-b",
      language: "en",
      overallScore: 72,
      modelUsed: "openrouter/free",
      createdAt: now,
    });
    expect(view?.jobs.map((job) => job.title)).toEqual(["Backend Engineer", "UI Engineer"]);
    expect(view?.pages[0].image?.blob).toBeInstanceOf(Blob);
    expect(new TextDecoder().decode((await storage.getCvFile(ids.cvId))!)).toBe("%PDF-1.4 test");
    expect((await storage.getCvPages(ids.cvId))?.runs).toHaveLength(1);
  });

  it("adds a new analysis to a stored CV and lists the latest one first", async () => {
    const first = await saveAnalysisResult(storage, {
      response: response(),
      source: SOURCE,
      pages: [],
      existingCvId: null,
      now: "2026-09-26T08:00:00.000Z",
    });
    const second = await saveAnalysisResult(storage, {
      response: response("mode-a"),
      source: { ...SOURCE, mode: "mode-a", jobTitle: "Backend Engineer", jobDescription: "TypeScript.", language: "id" },
      pages: [],
      existingCvId: first.cvId,
      now: "2026-09-26T09:00:00.000Z",
    });

    const history = await listHistory(storage);

    expect(second.cvId).toBe(first.cvId);
    expect(history).toHaveLength(1);
    expect(history[0].latest).toMatchObject({ id: second.reviewId, mode: "mode-a", language: "id", targetJobTitle: "Backend Engineer" });
    expect(await loadStoredAnalysis(storage, first.cvId, first.reviewId)).toMatchObject({ mode: "mode-b" });
    expect(await loadStoredAnalysis(storage, 404)).toBeNull();
  });

  it("builds the same view from a fresh response when nothing could be stored", () => {
    const view = viewFromResponse(response("mode-a"), { ...SOURCE, mode: "mode-a", jobTitle: " Backend " }, [], null, "now");

    expect(view).toMatchObject({ cvId: null, reviewId: null, targetJobTitle: "Backend", jobs: [], pageCount: 2 });
  });

  it("places the highlights for a fresh and a reopened view, with boxes only and no CV text (P5-T1)", async () => {
    const placed = response();
    placed.document.rawText = "Budi Santoso\nMenulis dokumentasi teknis.";
    placed.document.runs = [
      { pageNumber: 1, x: 72, y: 740, width: 80, fontSize: 11, hidden: false, textStart: 0, textEnd: 12 },
      { pageNumber: 1, x: 72, y: 700, width: 160, fontSize: 11, hidden: false, textStart: 13, textEnd: 40 },
    ];
    const pages = pagesFromResponse(placed);
    const fresh = viewFromResponse(placed, SOURCE, pages, null, "now");

    expect(fresh.highlights["sug-01"]).toMatchObject({ pageNumber: 1 });
    expect(fresh.highlights["sug-01"]?.rects).toHaveLength(1);
    expect(JSON.stringify(fresh.highlights)).not.toMatch(/Menulis|Budi/);

    const ids = await saveAnalysisResult(storage, { response: placed, source: SOURCE, pages, existingCvId: null, now: "now" });
    const reopened = await loadStoredAnalysis(storage, ids.cvId);
    expect(reopened?.highlights).toEqual(fresh.highlights);

    // DELTA-55: the same page turned upside down keeps its shape, and still gets no boxes.
    const turned = structuredClone(placed);
    turned.document.pages[0].rotation = 180;
    expect(viewFromResponse(turned, SOURCE, pagesFromResponse(turned), null, "now").highlights).toEqual({});
  });

  it("places nothing when the response left the runs out", () => {
    const omitted = response();
    omitted.document.runs = [];
    omitted.document.runsOmitted = true;
    expect(viewFromResponse(omitted, SOURCE, pagesFromResponse(omitted), null, "now").highlights).toEqual({});
  });

  it("stores the model notes with the review and reads an older review without them as none (DELTA-51)", async () => {
    const noted = response();
    noted.meta = { ...noted.meta, failoverOccurred: true, continuationOccurred: true };
    const ids = await saveAnalysisResult(storage, { response: noted, source: SOURCE, pages: [], existingCvId: null, now: "now" });

    expect(await loadStoredAnalysis(storage, ids.cvId)).toMatchObject({ failoverOccurred: true, continuationOccurred: true });

    const older = await storage.saveReview({
      cvId: ids.cvId,
      mode: "mode-b",
      targetJobTitle: null,
      targetJobDescription: null,
      overallScore: 60,
      atsChecks: [],
      weaknesses: [],
      suggestions: [],
      modelUsed: "openrouter/free",
      language: "en",
      createdAt: "later",
    });
    expect(await loadStoredAnalysis(storage, ids.cvId, older)).toMatchObject({ failoverOccurred: false, continuationOccurred: false });
  });
});

describe("isStorageFull", () => {
  it("recognizes a full quota directly or wrapped by Dexie", () => {
    expect(isStorageFull(new DOMException("full", "QuotaExceededError"))).toBe(true);
    expect(isStorageFull({ name: "AbortError", inner: { name: "QuotaExceededError" } })).toBe(true);
    expect(isStorageFull(new Error("other"))).toBe(false);
    expect(isStorageFull(null)).toBe(false);
  });
});
