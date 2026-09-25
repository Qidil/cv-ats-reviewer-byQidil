import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CvAtsDatabase, getDb } from "./dexie";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDb", () => {
  it("fails with a clear error when IndexedDB is missing, as during server rendering", () => {
    expect(typeof indexedDB).toBe("undefined");
    expect(() => getDb()).toThrow("IndexedDB is not available in this environment.");
  });

  it("returns one shared database once IndexedDB exists", () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("IDBKeyRange", IDBKeyRange);

    const db = getDb();

    expect(db).toBeInstanceOf(CvAtsDatabase);
    expect(getDb()).toBe(db);
  });
});
