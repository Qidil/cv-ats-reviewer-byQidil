// @vitest-environment jsdom
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeResponse, pdfFile } from "@/components/test-utils/fixtures";
import { renderWithI18n } from "@/components/test-utils/render";
import { saveAnalysisResult } from "@/lib/client/history";
import { CvAtsDatabase } from "@/lib/db/dexie";
import { createStorage, type CvAtsStorage } from "@/lib/db/storage";
import type { Language } from "@/lib/i18n/language";
import { HistoryDrawer, type HistoryActions } from "./history-drawer";

let db: CvAtsDatabase;
let storage: CvAtsStorage;

beforeEach(() => {
  db = new CvAtsDatabase("history-drawer-test", { indexedDB: new IDBFactory(), IDBKeyRange });
  storage = createStorage(db);
});

afterEach(() => {
  db.close();
});

/** Stored without page images: jsdom's Blob cannot pass fake-indexeddb's structured clone. */
function seed(fileName: string, language: Language = "en") {
  const file = pdfFile(fileName);
  return saveAnalysisResult(storage, {
    response: analyzeResponse("mode-b"),
    source: { file, fileName, mode: "mode-b", jobTitle: "", jobDescription: "", language },
    pages: [],
    existingCvId: null,
    now: "2026-09-26T03:00:00.000Z",
  });
}

function renderDrawer(options: { storage?: CvAtsStorage | null; busy?: boolean } = {}) {
  const actions: HistoryActions = {
    onOpenCv: vi.fn(async () => true),
    onDeleteCv: vi.fn((cvId: number) => storage.deleteCv(cvId)),
    onClearAll: vi.fn(() => storage.clearAll()),
  };
  renderWithI18n(
    <HistoryDrawer
      open
      onClose={vi.fn()}
      storage={options.storage === undefined ? storage : options.storage}
      busy={options.busy ?? false}
      activeCvId={null}
      actions={actions}
    />,
  );
  return actions;
}

describe("HistoryDrawer (FEAT-09)", () => {
  it("says history is off when the browser blocks IndexedDB", () => {
    renderDrawer({ storage: null });
    expect(screen.getByText("History is off because this browser blocks local storage.")).toBeInTheDocument();
  });

  it("explains an empty history", async () => {
    renderDrawer();
    expect(await screen.findByText("No analyses yet. Each result is saved here in this browser.")).toBeInTheDocument();
  });

  it("lists a CV with its pages, type, score, and the language it was written in", async () => {
    await seed("cv-budi-santoso.pdf", "id");
    renderDrawer();
    const row = await screen.findByRole("button", { name: /^Open cv-budi-santoso\.pdf / });
    expect(row).toHaveTextContent("1 page");
    expect(row).toHaveTextContent("General review");
    expect(row).toHaveTextContent("Bahasa Indonesia");
    expect(row).toHaveTextContent("Score 72");
  });

  it("opens a stored CV", async () => {
    const { cvId } = await seed("cv-budi-santoso.pdf");
    const actions = renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: /^Open cv-budi-santoso\.pdf / }));
    expect(actions.onOpenCv).toHaveBeenCalledWith(cvId);
  });

  it("deletes a CV only after confirmation, with the safe choice focused", async () => {
    const { cvId } = await seed("cv-budi-santoso.pdf");
    const actions = renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: "Delete: cv-budi-santoso.pdf" }));
    expect(screen.getByText("Delete cv-budi-santoso.pdf and its analyses from this browser?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No analyses yet. Each result is saved here in this browser.")).toBeInTheDocument();
    expect(actions.onDeleteCv).toHaveBeenCalledWith(cvId);
  });

  it("keeps the CV when the confirmation is dismissed", async () => {
    await seed("cv-budi-santoso.pdf");
    const actions = renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: "Delete: cv-budi-santoso.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.getByRole("button", { name: "Delete: cv-budi-santoso.pdf" })).toHaveFocus();
    expect(actions.onDeleteCv).not.toHaveBeenCalled();
  });

  it("clears everything after confirmation", async () => {
    await seed("cv-budi-santoso.pdf");
    await seed("cv-budi-santoso-2.pdf");
    const actions = renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: "Delete all" }));
    expect(screen.getByText("Delete every CV and analysis stored in this browser?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No analyses yet. Each result is saved here in this browser.")).toBeInTheDocument();
    expect(actions.onClearAll).toHaveBeenCalled();
  });

  it("locks opening and deleting while an analysis runs", async () => {
    await seed("cv-budi-santoso.pdf");
    renderDrawer({ busy: true });
    expect(await screen.findByRole("button", { name: /^Open cv-budi-santoso\.pdf / })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete: cv-budi-santoso.pdf" })).toBeDisabled();
    expect(screen.getByText("An analysis is running. Open or delete CVs after it finishes.")).toBeInTheDocument();
  });
});
