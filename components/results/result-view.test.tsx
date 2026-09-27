// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeResponse, pdfFile } from "@/components/test-utils/fixtures";
import { renderWithI18n } from "@/components/test-utils/render";
import { viewFromResponse, type AnalysisView } from "@/lib/client/history";
import { ResultView } from "./result-view";

const BOX = { x0: 0, y0: 0, x1: 612, y1: 792 };

function view(): AnalysisView {
  const file = pdfFile();
  const base = viewFromResponse(
    analyzeResponse("mode-a"),
    { file, fileName: file.name, mode: "mode-a", jobTitle: "", jobDescription: "JD", language: "en" },
    [{ pageNumber: 1, box: BOX, image: { blob: new Blob(["webp"], { type: "image/webp" }), width: 1240, height: 1605 } }],
    null,
    "2026-09-26T03:00:00.000Z",
  );
  // sug-01 quotes "Responsible for sales"; sug-02 has no snippet, so it stays card-only.
  return { ...base, highlights: { "sug-01": { pageNumber: 1, rects: [{ left: 12, top: 8, width: 30, height: 2 }] } } };
}

function renderView() {
  return renderWithI18n(<ResultView view={view()} notice={null} onAnalyzeAgain={vi.fn()} onNewCv={vi.fn()} />);
}

let scrollIntoView: ReturnType<typeof vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>>;
let scrollTo: ReturnType<typeof vi.fn<(options?: ScrollToOptions) => void>>;

beforeEach(() => {
  scrollIntoView = vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>();
  scrollTo = vi.fn<(options?: ScrollToOptions) => void>();
  Element.prototype.scrollIntoView = scrollIntoView;
  Element.prototype.scrollTo = scrollTo as unknown as Element["scrollTo"];
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  Reflect.deleteProperty(Element.prototype, "scrollTo");
  vi.useRealTimers();
});

describe("ResultView two-way link (AC-07.2, StyleGuide §5.2)", () => {
  it("offers Show in CV only on cards whose snippet has a highlight (P5-D2)", () => {
    renderView();
    const suggestions = within(screen.getByRole("region", { name: "What to change" }));
    expect(suggestions.getAllByRole("button", { name: "Show in CV" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Must change: Add a result to the sales bullet" })).toBeInTheDocument();
  });

  it("scrolls the viewer to the highlight when a card asks, and emphasizes it while the control is in use", () => {
    vi.useFakeTimers();
    renderView();
    const show = screen.getByRole("button", { name: "Show in CV" });
    const highlight = () => screen.getByRole("button", { name: "Must change: Add a result to the sales bullet" });
    fireEvent.mouseEnter(show);
    expect(highlight().className).toContain("border-[2.5px]");
    fireEvent.mouseLeave(show);
    expect(highlight().className).toContain("border-[1.5px]");
    fireEvent.click(show);
    expect(scrollTo).toHaveBeenCalled();
    // The box the card pointed at stays marked for 1.5 s (G5-05).
    expect(highlight().className).toContain("border-[2.5px]");
    act(() => vi.advanceTimersByTime(1500));
    expect(highlight().className).toContain("border-[1.5px]");
  });

  it("brings the card into view, focuses its title, and rings it briefly when a highlight is picked", () => {
    vi.useFakeTimers();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Must change: Add a result to the sales bullet" }));
    const title = screen.getByRole("heading", { level: 4, name: "Add a result to the sales bullet" });
    const card = title.closest("li");
    expect(title).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
    expect(card?.className).toContain("ring-2");
    act(() => vi.advanceTimersByTime(1500));
    expect(card?.className).not.toContain("ring-2");
  });
});
