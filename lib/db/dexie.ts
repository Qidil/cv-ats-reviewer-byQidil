import Dexie, { type DexieOptions, type EntityTable, type Table } from "dexie";
import type { CvEntity, CvFileEntity, CvPagesEntity, JobMatchEntity, ReviewEntity } from "@/types/db";

export const DB_NAME = "CvAtsReviewerDB";

export class CvAtsDatabase extends Dexie {
  cvs!: EntityTable<CvEntity, "id">;
  cv_files!: Table<CvFileEntity, number>;
  cv_pages!: Table<CvPagesEntity, number>;
  reviews!: EntityTable<ReviewEntity, "id">;
  job_matches!: EntityTable<JobMatchEntity, "id">;

  constructor(name: string = DB_NAME, options?: DexieOptions) {
    super(name, options);
    // Still version 1: no public release has stored data yet (schema.md §6.4).
    this.version(1).stores({
      cvs: "++id, fileName, uploadedAt",
      cv_files: "cvId",
      cv_pages: "cvId",
      reviews: "++id, cvId, mode, createdAt",
      job_matches: "++id, reviewId, cvId, matchScore",
    });
  }
}

let browserDb: CvAtsDatabase | undefined;

/** Opened on first use because IndexedDB does not exist during server rendering. */
export function getDb(): CvAtsDatabase {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment.");
  }
  browserDb ??= new CvAtsDatabase();
  return browserDb;
}
