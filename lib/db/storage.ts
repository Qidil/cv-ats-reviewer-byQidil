import type { CvEntity, JobMatchEntity, ReviewEntity } from "@/types/db";
import type { CvAtsDatabase } from "./dexie";

export type NewCv = Omit<CvEntity, "id"> & { pdfData: ArrayBuffer };
export type NewReview = Omit<ReviewEntity, "id">;
export type NewJobMatch = Omit<JobMatchEntity, "id">;

/** IndexedDB has no foreign keys, so these checks are what keeps history free of orphans. */
export class StorageIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageIntegrityError";
  }
}

export function createStorage(db: CvAtsDatabase) {
  return {
    /** Writes the CV record and its PDF bytes in one transaction. */
    saveCv({ pdfData, ...cv }: NewCv): Promise<number> {
      return db.transaction("rw", [db.cvs, db.cv_files], async () => {
        const cvId = await db.cvs.add(cv);
        await db.cv_files.add({ cvId, pdfData });
        return cvId;
      });
    },

    getCvById(id: number): Promise<CvEntity | undefined> {
      return db.cvs.get(id);
    },

    getCvFile(cvId: number): Promise<ArrayBuffer | undefined> {
      return db.cv_files.get(cvId).then((file) => file?.pdfData);
    },

    /** Newest upload first. PDF bytes are not included. */
    getAllCvs(): Promise<CvEntity[]> {
      return db.cvs.orderBy("uploadedAt").reverse().toArray();
    },

    /** Removes the CV together with its PDF bytes and every review and job match that belongs to it. */
    deleteCv(id: number): Promise<void> {
      return db.transaction("rw", [db.cvs, db.cv_files, db.reviews, db.job_matches], async () => {
        await db.job_matches.where("cvId").equals(id).delete();
        await db.reviews.where("cvId").equals(id).delete();
        await db.cv_files.delete(id);
        await db.cvs.delete(id);
      });
    },

    saveReview(review: NewReview): Promise<number> {
      return db.transaction("rw", [db.cvs, db.reviews], async () => {
        const cv = await db.cvs.get(review.cvId);
        if (!cv) {
          throw new StorageIntegrityError(`CV ${review.cvId} does not exist.`);
        }
        return db.reviews.add(review);
      });
    },

    /** Newest review first. */
    getReviewsByCvId(cvId: number): Promise<ReviewEntity[]> {
      return db.reviews.where("cvId").equals(cvId).reverse().sortBy("createdAt");
    },

    /** All-or-nothing: one invalid match rejects the whole batch. */
    saveJobMatches(matches: NewJobMatch[]): Promise<void> {
      return db.transaction("rw", [db.reviews, db.job_matches], async () => {
        const reviewIds = [...new Set(matches.map((match) => match.reviewId))];
        const found = await db.reviews.bulkGet(reviewIds);
        const reviewsById = new Map(
          found
            .filter((review): review is ReviewEntity => review !== undefined)
            .map((review) => [review.id, review]),
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
      });
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
