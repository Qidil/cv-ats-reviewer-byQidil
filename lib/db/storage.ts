import type { CvEntity, CvPageImage, CvPagesEntity, JobMatchEntity, ReviewEntity } from "@/types/db";
import type { DocumentRun } from "@/types/api";
import type { CvAtsDatabase } from "./dexie";

export type NewCv = Omit<CvEntity, "id"> & {
  pdfData: ArrayBuffer;
  pages?: CvPageImage[];
  runs?: DocumentRun[];
  runsOmitted?: boolean;
};
export type NewReview = Omit<ReviewEntity, "id">;
export type NewJobMatch = Omit<JobMatchEntity, "id">;

export interface NewAnalysis {
  /** A CV analyzed for the first time; leave out and give `cvId` for a new analysis of a stored CV. */
  cv?: NewCv;
  cvId?: number;
  review: Omit<NewReview, "cvId">;
  jobMatches: Array<Omit<NewJobMatch, "cvId" | "reviewId">>;
}

/** IndexedDB has no foreign keys, so these checks are what keeps history free of orphans. */
export class StorageIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageIntegrityError";
  }
}

export function createStorage(db: CvAtsDatabase) {
  const addCv = async ({ pdfData, pages = [], runs = [], runsOmitted = false, ...cv }: NewCv): Promise<number> => {
    const cvId = await db.cvs.add(cv);
    await db.cv_files.add({ cvId, pdfData });
    await db.cv_pages.add({ cvId, pages, runs, runsOmitted });
    return cvId;
  };

  const addReview = async (review: NewReview): Promise<number> => {
    const cv = await db.cvs.get(review.cvId);
    if (!cv) {
      throw new StorageIntegrityError(`CV ${review.cvId} does not exist.`);
    }
    return db.reviews.add(review);
  };

  const addJobMatches = async (matches: NewJobMatch[]): Promise<void> => {
    const reviewIds = [...new Set(matches.map((match) => match.reviewId))];
    const found = await db.reviews.bulkGet(reviewIds);
    const reviewsById = new Map(
      found.filter((review): review is ReviewEntity => review !== undefined).map((review) => [review.id, review]),
    );

    for (const match of matches) {
      const review = reviewsById.get(match.reviewId);
      if (!review) {
        throw new StorageIntegrityError(`Review ${match.reviewId} does not exist.`);
      }
      if (review.mode !== "mode-b") {
        throw new StorageIntegrityError(`Review ${review.id} is not a Mode B review.`);
      }
      if (review.cvId !== match.cvId) {
        throw new StorageIntegrityError(
          `Job match points to CV ${match.cvId}, but review ${review.id} belongs to CV ${review.cvId}.`,
        );
      }
    }

    await db.job_matches.bulkAdd(matches);
  };

  const allTables = [db.cvs, db.cv_files, db.cv_pages, db.reviews, db.job_matches];

  return {
    /** Writes the CV record, its PDF bytes, and its page data in one transaction. */
    saveCv(cv: NewCv): Promise<number> {
      return db.transaction("rw", [db.cvs, db.cv_files, db.cv_pages], () => addCv(cv));
    },

    /** One analysis, all or nothing (schema.md Integrity Rule 1). */
    saveAnalysis({ cv, cvId, review, jobMatches }: NewAnalysis): Promise<{ cvId: number; reviewId: number }> {
      return db.transaction("rw", allTables, async () => {
        const id = cv !== undefined ? await addCv(cv) : cvId;
        if (id === undefined) {
          throw new StorageIntegrityError("An analysis needs a new CV or the id of a stored one.");
        }
        const reviewId = await addReview({ ...review, cvId: id });
        if (jobMatches.length > 0) {
          await addJobMatches(jobMatches.map((match) => ({ ...match, reviewId, cvId: id })));
        }
        return { cvId: id, reviewId };
      });
    },

    getCvById(id: number): Promise<CvEntity | undefined> {
      return db.cvs.get(id);
    },

    getCvFile(cvId: number): Promise<ArrayBuffer | undefined> {
      return db.cv_files.get(cvId).then((file) => file?.pdfData);
    },

    getCvPages(cvId: number): Promise<CvPagesEntity | undefined> {
      return db.cv_pages.get(cvId);
    },

    /** Newest upload first. PDF bytes and page images are not included. */
    getAllCvs(): Promise<CvEntity[]> {
      return db.cvs.orderBy("uploadedAt").reverse().toArray();
    },

    /** Removes the CV together with its PDF bytes, page data, and every review and job match that belongs to it. */
    deleteCv(id: number): Promise<void> {
      return db.transaction("rw", allTables, async () => {
        await db.job_matches.where("cvId").equals(id).delete();
        await db.reviews.where("cvId").equals(id).delete();
        await db.cv_pages.delete(id);
        await db.cv_files.delete(id);
        await db.cvs.delete(id);
      });
    },

    /** Empties every table (schema.md Integrity Rule 5). */
    clearAll(): Promise<void> {
      return db.transaction("rw", allTables, async () => {
        await Promise.all(allTables.map((table) => table.clear()));
      });
    },

    saveReview(review: NewReview): Promise<number> {
      return db.transaction("rw", [db.cvs, db.reviews], () => addReview(review));
    },

    /** Newest review first. */
    getReviewsByCvId(cvId: number): Promise<ReviewEntity[]> {
      return db.reviews.where("cvId").equals(cvId).reverse().sortBy("createdAt");
    },

    /** All-or-nothing: one invalid match rejects the whole batch. */
    saveJobMatches(matches: NewJobMatch[]): Promise<void> {
      return db.transaction("rw", [db.reviews, db.job_matches], () => addJobMatches(matches));
    },

    /** Highest match score first. */
    getJobMatchesByCvId(cvId: number): Promise<JobMatchEntity[]> {
      return db.job_matches.where("cvId").equals(cvId).reverse().sortBy("matchScore");
    },

    /** Highest match score first. */
    getJobMatchesByReviewId(reviewId: number): Promise<JobMatchEntity[]> {
      return db.job_matches.where("reviewId").equals(reviewId).reverse().sortBy("matchScore");
    },
  };
}

export type CvAtsStorage = ReturnType<typeof createStorage>;
