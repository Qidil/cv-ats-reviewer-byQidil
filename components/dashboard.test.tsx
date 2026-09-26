// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// The dashboard loads the result view on demand (G-16); loading it here keeps the first lazy render fast.
import "@/components/results/result-view";
import { analyzeResponse, pdfFile } from "@/components/test-utils/fixtures";
import { renderWithI18n } from "@/components/test-utils/render";
import { sendAnalysis, type AnalyzeOutcome } from "@/lib/client/analyze";
import { listHistory, loadStoredAnalysis, saveAnalysisResult, writeActiveCvId, type AnalysisView } from "@/lib/client/history";
import { getDb } from "@/lib/db/dexie";
import { createStorage } from "@/lib/db/storage";
import { LOCAL_STORAGE_KEYS } from "@/types/db";
import type { AnalysisMode } from "@/types/ats";
import { Dashboard } from "./dashboard";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/client/analyze", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client/analyze")>()),
  sendAnalysis: vi.fn(),
}));

vi.mock("@/lib/client/history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/client/history")>();
  return { ...actual, loadStoredAnalysis: vi.fn(actual.loadStoredAnalysis) };
});

const send = vi.mocked(sendAnalysis);
const loadStored = vi.mocked(loadStoredAnalysis);
const FAKE_KEY = "sk-or-v1-test-0000";

/** Without page images: jsdom's Blob cannot pass fake-indexeddb's structured clone. */
function success(mode: AnalysisMode = "mode-b"): Extract<AnalyzeOutcome, { kind: "success" }> {
  const response = analyzeResponse(mode);
  response.document.pages = response.document.pages.map((page) => ({ ...page, preview: null }));
  response.document.previewsOmitted = true;
  return { kind: "success", response };
}

function apiError(code: Extract<AnalyzeOutcome, { kind: "api-error" }>["code"], message: string, retryable = false) {
  return { kind: "api-error", code, message, retryable } as const;
}

function pickFile() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) {
    throw new Error("The file input is missing.");
  }
  fireEvent.change(input, { target: { files: [pdfFile()] } });
}

function analyze() {
  fireEvent.click(screen.getByRole("button", { name: /^(Analyze CV|Try again)$/ }));
}

async function storeAnalysis(fileName: string, language: "en" | "id" = "en") {
  const file = pdfFile(fileName);
  return saveAnalysisResult(createStorage(getDb()), {
    response: success().response,
    source: { file, fileName, mode: "mode-b", jobTitle: "", jobDescription: "", language },
    pages: [],
    existingCvId: null,
    now: "2026-09-26T03:00:00.000Z",
  });
}

beforeEach(async () => {
  localStorage.clear();
  await createStorage(getDb()).clearAll();
  send.mockReset();
  loadStored.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Dashboard", () => {
  it("asks for a file before sending anything", async () => {
    renderWithI18n(<Dashboard />);
    analyze();
    expect(await screen.findByText("Choose a PDF first.")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("requires the job description when matching a posting", async () => {
    renderWithI18n(<Dashboard />);
    pickFile();
    fireEvent.click(screen.getByRole("radio", { name: /Match a job posting/ }));
    analyze();
    expect(await screen.findByText("Paste the job description to match against.")).toBeInTheDocument();
    expect(screen.getByLabelText("Job description")).toHaveFocus();
    expect(send).not.toHaveBeenCalled();
  });

  it("shows the result with red items first, stores it, and remembers it as the active CV", async () => {
    send.mockResolvedValue(success());
    renderWithI18n(<Dashboard />);
    pickFile();
    analyze();
    const heading = await screen.findByRole("heading", { name: "Result" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText("72")).toBeInTheDocument();
    const suggestions = within(screen.getByRole("region", { name: "What to change" }));
    expect(suggestions.getAllByRole("heading", { level: 4 }).map((item) => item.textContent)).toEqual([
      "Add a result to the sales bullet",
      "Tighten the summary",
    ]);
    expect(suggestions.getByText("Responsible for sales")).toBeInTheDocument();
    const jobs = within(screen.getByRole("region", { name: "Roles that fit this CV best" }));
    expect(jobs.getAllByText(/% match$/).map((item) => item.textContent)).toEqual(["82% match", "64% match"]);
    expect(screen.queryByText(/next one in the chain/)).not.toBeInTheDocument();
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      fileName: "cv-budi-santoso.pdf",
      mode: "mode-b",
      language: "en",
      personalKey: null,
    });
    const entries = await listHistory(createStorage(getDb()));
    expect(entries).toHaveLength(1);
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.activeCvId)).toBe(String(entries[0]?.cv.id));
  });

  it("notes under the result when another model wrote it or its answer was continued (DELTA-51)", async () => {
    const outcome = success();
    outcome.response.meta = { ...outcome.response.meta, modelUsed: "model-2", failoverOccurred: true, continuationOccurred: true };
    send.mockResolvedValue(outcome);
    renderWithI18n(<Dashboard />);
    pickFile();
    analyze();
    expect(await screen.findByText("Model: model-2")).toBeInTheDocument();
    expect(screen.getByText("The first model could not finish, so the next one in the chain wrote this result.")).toBeInTheDocument();
    expect(screen.getByText("The AI's answer was cut off once, so it was continued to finish the report.")).toBeInTheDocument();
  });

  it("keeps the file and offers a personal key when the daily quota is used up (§7.4)", async () => {
    send.mockResolvedValue({
      ...apiError("DAILY_QUOTA_EXCEEDED", "Today's free analyses are used up."),
      resetsAt: "2026-09-27T00:00:00+08:00",
    });
    renderWithI18n(<Dashboard />);
    pickFile();
    analyze();
    expect(await screen.findByText("Today's free analyses are used up")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(screen.getByRole("alert")).toHaveTextContent("00:00 GMT+8");
    expect(screen.getByText("cv-budi-santoso.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use my own API key" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toHaveAttribute("open");
  });

  it("clears the file and asks for another after a PDF error (PRD §6.3)", async () => {
    send.mockResolvedValue(apiError("PDF_NO_TEXT_FOUND", "The text in this PDF cannot be read."));
    renderWithI18n(<Dashboard />);
    pickFile();
    analyze();
    expect(await screen.findByText("The text in this PDF cannot be read.")).toBeInTheDocument();
    expect(screen.queryByText("cv-budi-santoso.pdf")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose a file" })).toHaveFocus());
  });

  it("turns the main button into a retry when trying again can work", async () => {
    send.mockResolvedValue(apiError("MODEL_UNAVAILABLE", "No AI model is available right now.", true));
    renderWithI18n(<Dashboard />);
    pickFile();
    analyze();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No AI model is available right now.");
  });

  it("leaves the analyzing screen even when sending fails unexpectedly (G-03)", async () => {
    send.mockRejectedValue(new Error("unexpected"));
    renderWithI18n(<Dashboard />);
    pickFile();
    analyze();
    expect(await screen.findByRole("alert")).toHaveTextContent("The server's answer could not be read. Try again.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bahasa Indonesia" })).not.toHaveAttribute("aria-disabled");
  });

  it("focuses the progress card, locks the language, and returns to the form silently on cancel", async () => {
    send.mockImplementation(
      (_request, callbacks) =>
        new Promise((resolve) => {
          callbacks?.signal?.addEventListener("abort", () => resolve({ kind: "cancelled" }));
        }),
    );
    renderWithI18n(<Dashboard />);
    pickFile();
    analyze();
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    // G-12: the submit button is gone, so focus lands on the card that holds Cancel.
    await waitFor(() => expect(screen.getByRole("group", { name: "Uploading the PDF: 0%" })).toHaveFocus());
    expect(screen.getByRole("link", { name: "Bahasa Indonesia" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(cancel);
    const submit = await screen.findByRole("button", { name: "Analyze CV" });
    await waitFor(() => expect(submit).toHaveFocus());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("cv-budi-santoso.pdf")).toBeInTheDocument();
  });

  it("reopens the last result from this browser, without the network (AC-08.1)", async () => {
    const { cvId } = await storeAnalysis("cv-budi-santoso.pdf", "id");
    writeActiveCvId(cvId);
    renderWithI18n(<Dashboard />);
    expect(await screen.findByRole("heading", { name: "Result" })).toBeInTheDocument();
    expect(screen.getByText("This result was written in Indonesian.")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not let a stored result that opens late replace the one the user picked (G-14)", async () => {
    const first = await storeAnalysis("cv-first.pdf");
    await storeAnalysis("cv-second.pdf");
    writeActiveCvId(first.cvId);
    let release: (view: AnalysisView | null) => void = () => undefined;
    loadStored.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    renderWithI18n(<Dashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "History" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Open.*cv-second\.pdf/ }));
    expect(await screen.findByRole("heading", { name: "Result" })).toBeInTheDocument();
    expect(screen.getByText(/cv-second\.pdf/)).toBeInTheDocument();
    release(null);
    await waitFor(() => expect(loadStored).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole("heading", { name: "Result" })).toBeInTheDocument();
    expect(screen.getByText(/cv-second\.pdf/)).toBeInTheDocument();
  });

  it("keeps the result in React state and says so when IndexedDB is blocked (P4-D3)", async () => {
    vi.stubGlobal("indexedDB", undefined);
    send.mockResolvedValue(success());
    renderWithI18n(<Dashboard />);
    expect(await screen.findByText(/Local storage is blocked, often by private browsing/)).toBeInTheDocument();
    pickFile();
    analyze();
    expect(await screen.findByRole("heading", { name: "Result" })).toBeInTheDocument();
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.activeCvId)).toBeNull();
  });

  it("sends a saved personal key and removes a rejected one in one click", async () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.byokKey, FAKE_KEY);
    send.mockResolvedValue(apiError("AUTH_INVALID_KEY", "Your AI provider rejected this API key."));
    renderWithI18n(<Dashboard />);
    pickFile();
    analyze();
    fireEvent.click(await screen.findByRole("button", { name: "Remove my key" }));
    expect(send.mock.calls[0]?.[0].personalKey).toEqual({ apiKey: FAKE_KEY, model: "", baseUrl: "" });
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.byokKey)).toBeNull();
    expect(screen.getByText("Key removed. Analyses now use the free quota.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
