import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AtsCheck } from "@/types/ats";
import { CvAtsDatabase } from "./dexie";
import {
  createStorage,
  StorageIntegrityError,
  type CvAtsStorage,
  type NewCv,
  type NewJobMatch,
  type NewReview,
} from "./storage";

let db: CvAtsDatabase;
let storage: CvAtsStorage;

beforeEach(() => {
  // A fresh factory per test keeps every test on an empty, isolated database.
  db = new CvAtsDatabase("cv-ats-test", { indexedDB: new IDBFactory(), IDBKeyRange });
  storage = createStorage(db);
});

afterEach(() => {
  db.close();
});

const keywordCheck: AtsCheck = {
  id: "keyword",
  name: "Kesesuaian Kata Kunci",
  status: "pass",
  score: 85,
  detail: "12 dari 14 kata kunci lowongan ditemukan di CV.",
};

function cvFixture(overrides: Partial<NewCv> = {}): NewCv {
  return {
    fileName: "cv-budi-santoso.pdf",
    fileSize: 4,
    uploadedAt: "2026-09-01T08:00:00.000Z",
    rawText: "Budi Santoso, Frontend Developer",
    sanitizedText: "Budi Santoso, Frontend Developer",
    visibleText: "Budi Santoso, Frontend Developer",
    source: "operator-list",
    hiddenText: { checked: true, runCount: 0, charCount: 0, hasWords: false, reasons: [], samples: [] },
    pdfData: new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer,
    pageCount: 1,
    ...overrides,
  };
}

function reviewFixture(cvId: number, overrides: Partial<NewReview> = {}): NewReview {
  return {
    cvId,
    mode: "mode-a",
    targetJobTitle: "Frontend Developer",
    targetJobDescription: "Menguasai React dan TypeScript.",
    overallScore: 82,
    atsChecks: [keywordCheck],
    weaknesses: ["Pengalaman kerja belum memuat angka hasil."],
    suggestions: [
      {
        id: "sug-01",
        title: "Tambahkan angka hasil kerja",
        description:
          "Ubah 'Bertanggung jawab atas halaman checkout' menjadi 'Mempercepat halaman checkout 30%'.",
        category: "quantified",
        priority: "high",
        targetTextSnippet: "Bertanggung jawab atas halaman checkout",
        pageNumber: 1,
      },
    ],
    modelUsed: "openrouter/free",
    language: "id",
    createdAt: "2026-09-01T08:05:00.000Z",
    ...overrides,
  };
}

function modeBReviewFixture(cvId: number, overrides: Partial<NewReview> = {}): NewReview {
  return reviewFixture(cvId, {
    mode: "mode-b",
    targetJobTitle: null,
    targetJobDescription: null,
    ...overrides,
  });
}

function matchFixture(
  reviewId: number,
  cvId: number,
  overrides: Partial<NewJobMatch> = {},
): NewJobMatch {
  return {
    reviewId,
    cvId,
    jobTitle: "Frontend Developer",
    matchScore: 80,
    reason: "Empat tahun membangun antarmuka React.",
    keyStrengths: ["React", "TypeScript"],
    missingSkills: ["Playwright"],
    createdAt: "2026-09-01T08:06:00.000Z",
    ...overrides,
  };
}

describe("cvs", () => {
  it("returns the stored PDF bytes unchanged", async () => {
    const id = await storage.saveCv(cvFixture());

    const stored = await storage.getCvById(id);
    const pdfData = await storage.getCvFile(id);

    expect(stored?.fileName).toBe("cv-budi-santoso.pdf");
    expect(new Uint8Array(pdfData!)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  });

  it("returns undefined for an unknown id", async () => {
    await expect(storage.getCvById(404)).resolves.toBeUndefined();
    await expect(storage.getCvFile(404)).resolves.toBeUndefined();
  });

  it("lists CVs with the newest upload first, without loading PDF bytes", async () => {
    await storage.saveCv(cvFixture({ fileName: "lama.pdf", uploadedAt: "2026-08-01T00:00:00.000Z" }));
    await storage.saveCv(cvFixture({ fileName: "baru.pdf", uploadedAt: "2026-09-10T00:00:00.000Z" }));
    await storage.saveCv(cvFixture({ fileName: "tengah.pdf", uploadedAt: "2026-08-20T00:00:00.000Z" }));

    const cvs = await storage.getAllCvs();

    expect(cvs.map((cv) => cv.fileName)).toEqual(["baru.pdf", "tengah.pdf", "lama.pdf"]);
    expect(cvs.some((cv) => "pdfData" in cv)).toBe(false);
  });
});

describe("reviews", () => {
  it("rejects a review for a CV that does not exist", async () => {
    await expect(storage.saveReview(reviewFixture(999))).rejects.toBeInstanceOf(
      StorageIntegrityError,
    );
  });

  it("returns a CV's Mode A and Mode B reviews with the newest first", async () => {
    const cvId = await storage.saveCv(cvFixture());
    const otherCvId = await storage.saveCv(cvFixture({ fileName: "cv-lain.pdf" }));
    await storage.saveReview(reviewFixture(cvId, { createdAt: "2026-09-01T08:05:00.000Z" }));
    await storage.saveReview(modeBReviewFixture(cvId, { createdAt: "2026-09-02T08:05:00.000Z" }));
    await storage.saveReview(reviewFixture(otherCvId));

    const reviews = await storage.getReviewsByCvId(cvId);

    expect(reviews.map((review) => review.mode)).toEqual(["mode-b", "mode-a"]);
    expect(reviews[1].suggestions[0].targetTextSnippet).toBe(
      "Bertanggung jawab atas halaman checkout",
    );
  });
});

describe("job matches", () => {
  it("links matches to their Mode B review, highest score first", async () => {
    const cvId = await storage.saveCv(cvFixture());
    const reviewId = await storage.saveReview(modeBReviewFixture(cvId));

    await storage.saveJobMatches([
      matchFixture(reviewId, cvId, { jobTitle: "UI Engineer", matchScore: 64 }),
      matchFixture(reviewId, cvId, { jobTitle: "Frontend Developer", matchScore: 88 }),
      matchFixture(reviewId, cvId, { jobTitle: "Fullstack Developer", matchScore: 71 }),
    ]);

    const byReview = await storage.getJobMatchesByReviewId(reviewId);
    const byCv = await storage.getJobMatchesByCvId(cvId);

    expect(byReview.map((match) => match.jobTitle)).toEqual([
      "Frontend Developer",
      "Fullstack Developer",
      "UI Engineer",
    ]);
    expect(byCv).toHaveLength(3);
  });

  it("rejects the whole batch when one match is invalid", async () => {
    const cvId = await storage.saveCv(cvFixture());
    const otherCvId = await storage.saveCv(cvFixture({ fileName: "cv-lain.pdf" }));
    const modeBReviewId = await storage.saveReview(modeBReviewFixture(cvId));
    const modeAReviewId = await storage.saveReview(reviewFixture(cvId));

    const invalidBatches: NewJobMatch[][] = [
      [matchFixture(modeBReviewId, cvId), matchFixture(9999, cvId)],
      [matchFixture(modeAReviewId, cvId)],
      [matchFixture(modeBReviewId, cvId), matchFixture(modeBReviewId, otherCvId)],
    ];

    for (const batch of invalidBatches) {
      await expect(storage.saveJobMatches(batch)).rejects.toBeInstanceOf(StorageIntegrityError);
    }
    await expect(storage.getJobMatchesByCvId(cvId)).resolves.toEqual([]);
  });
});

describe("deleteCv", () => {
  it("removes the CV with its PDF, reviews, and job matches and leaves other CVs alone", async () => {
    const cvId = await storage.saveCv(cvFixture());
    const keptCvId = await storage.saveCv(cvFixture({ fileName: "cv-disimpan.pdf" }));
    const reviewId = await storage.saveReview(modeBReviewFixture(cvId));
    await storage.saveJobMatches([matchFixture(reviewId, cvId)]);
    const keptReviewId = await storage.saveReview(modeBReviewFixture(keptCvId));
    await storage.saveJobMatches([matchFixture(keptReviewId, keptCvId)]);

    await storage.deleteCv(cvId);

    await expect(storage.getCvById(cvId)).resolves.toBeUndefined();
    await expect(storage.getCvFile(cvId)).resolves.toBeUndefined();
    await expect(storage.getReviewsByCvId(cvId)).resolves.toEqual([]);
    await expect(storage.getJobMatchesByCvId(cvId)).resolves.toEqual([]);
    await expect(storage.getCvById(keptCvId)).resolves.toBeDefined();
    await expect(storage.getCvFile(keptCvId)).resolves.toBeDefined();
    await expect(storage.getReviewsByCvId(keptCvId)).resolves.toHaveLength(1);
    await expect(storage.getJobMatchesByCvId(keptCvId)).resolves.toHaveLength(1);
  });

  it("also removes the CV's page data", async () => {
    const cvId = await storage.saveCv(cvFixture());

    await storage.deleteCv(cvId);

    await expect(storage.getCvPages(cvId)).resolves.toBeUndefined();
  });
});

describe("page data", () => {
  it("keeps page images as Blobs and the runs next to them", async () => {
    const image = new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], { type: "image/webp" });
    const cvId = await storage.saveCv(
      cvFixture({
        pages: [{ pageNumber: 1, box: { x0: 0, y0: 0, x1: 612, y1: 792 }, image: { blob: image, width: 1240, height: 1605 } }],
        runs: [{ pageNumber: 1, x: 72, y: 740, width: 80, fontSize: 11, hidden: false, textStart: 0, textEnd: 12 }],
      }),
    );

    const stored = await storage.getCvPages(cvId);

    expect(stored?.runs).toHaveLength(1);
    expect(stored?.runsOmitted).toBe(false);
    expect(stored?.pages[0].image?.width).toBe(1240);
    expect(stored?.pages[0].image?.blob).toBeInstanceOf(Blob);
    expect(stored?.pages[0].image?.blob.size).toBe(4);
  });

  it("stores an empty record when a CV comes without page data", async () => {
    const cvId = await storage.saveCv(cvFixture());

    await expect(storage.getCvPages(cvId)).resolves.toEqual({ cvId, pages: [], runs: [], runsOmitted: false });
  });
});

describe("saveAnalysis", () => {
  // saveAnalysis sets cvId and reviewId itself, so the fixtures' placeholder ids are overwritten.
  const review = () => modeBReviewFixture(0);
  const match = (jobTitle: string, matchScore: number) => matchFixture(0, 0, { jobTitle, matchScore });

  it("writes a new CV, its review, and its job matches together", async () => {
    const { cvId, reviewId } = await storage.saveAnalysis({
      cv: cvFixture(),
      review: review(),
      jobMatches: [match("UI Engineer", 64), match("Frontend Developer", 88)],
    });

    await expect(storage.getCvFile(cvId)).resolves.toBeDefined();
    await expect(storage.getCvPages(cvId)).resolves.toBeDefined();
    expect((await storage.getReviewsByCvId(cvId)).map((item) => item.id)).toEqual([reviewId]);
    expect((await storage.getJobMatchesByReviewId(reviewId)).map((item) => item.jobTitle)).toEqual([
      "Frontend Developer",
      "UI Engineer",
    ]);
  });

  it("adds a new analysis to a stored CV", async () => {
    const cvId = await storage.saveCv(cvFixture());

    const saved = await storage.saveAnalysis({ cvId, review: review(), jobMatches: [] });

    expect(saved.cvId).toBe(cvId);
    await expect(storage.getAllCvs()).resolves.toHaveLength(1);
    await expect(storage.getReviewsByCvId(cvId)).resolves.toHaveLength(1);
  });

  it("writes nothing when any part is invalid", async () => {
    const modeA = { ...review(), mode: "mode-a" as const };

    await expect(
      storage.saveAnalysis({ cv: cvFixture(), review: modeA, jobMatches: [match("UI Engineer", 64)] }),
    ).rejects.toBeInstanceOf(StorageIntegrityError);
    await expect(storage.saveAnalysis({ cvId: 404, review: review(), jobMatches: [] })).rejects.toBeInstanceOf(
      StorageIntegrityError,
    );
    await expect(storage.getAllCvs()).resolves.toEqual([]);
  });
});

describe("clearAll", () => {
  it("empties every table", async () => {
    await storage.saveAnalysis({
      cv: cvFixture(),
      review: modeBReviewFixture(0),
      jobMatches: [matchFixture(0, 0)],
    });

    await storage.clearAll();

    for (const table of [db.cvs, db.cv_files, db.cv_pages, db.reviews, db.job_matches]) {
      await expect(table.count()).resolves.toBe(0);
    }
  });
});
