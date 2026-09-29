// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/components/test-utils/render";
import type { CvPageImage } from "@/types/db";
import type { InspectorMark } from "./highlight-overlay";
import { PageViewer, type PageViewerHandle } from "./page-viewer";

const BOX = { x0: 0, y0: 0, x1: 612, y1: 792 };
const image = () => ({ blob: new Blob(["webp"], { type: "image/webp" }), width: 1240, height: 1605 });

const pages: CvPageImage[] = [
  { pageNumber: 1, box: BOX, image: image() },
  { pageNumber: 2, box: BOX, image: image() },
  { pageNumber: 3, box: BOX, image: null },
];

const marks: InspectorMark[] = [
  { id: "sug-02", priority: "medium", title: "Add a number", pageNumber: 1, rects: [{ left: 10, top: 40, width: 30, height: 2 }] },
  {
    id: "sug-01",
    priority: "high",
    title: "Rewrite the summary",
    pageNumber: 1,
    rects: [
      { left: 10, top: 12, width: 50, height: 2 },
      { left: 10, top: 14, width: 20, height: 2 },
    ],
  },
  { id: "sug-03", priority: "low", title: "Tighten a bullet", pageNumber: 2, rects: [{ left: 5, top: 5, width: 10, height: 2 }] },
];

// jsdom has no scrolling; these stand in and are put back after every test.
const scrollTo = vi.fn<(options?: ScrollToOptions) => void>();
const scrollIntoView = vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>();

beforeEach(() => {
  Element.prototype.scrollTo = scrollTo as unknown as Element["scrollTo"];
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  scrollTo.mockReset();
  scrollIntoView.mockReset();
  Reflect.deleteProperty(Element.prototype, "scrollTo");
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderViewer(overrides: Partial<Parameters<typeof PageViewer>[0]> = {}) {
  const onSelectHighlight = vi.fn();
  const ref = createRef<PageViewerHandle>();
  renderWithI18n(
    <PageViewer
      ref={ref}
      pages={pages}
      marks={marks}
      idPrefix="t"
      emphasizedId={null}
      reduceMotion={false}
      onSelectHighlight={onSelectHighlight}
      {...overrides}
    />,
  );
  return { onSelectHighlight, ref };
}

const counter = () => within(screen.getByRole("group", { name: "Page controls" })).getByText(/^Page \d of 3$/);
const scroller = () => screen.getByRole("region", { name: "Pages" });

/** Gives the page items and the scroll window the geometry jsdom does not compute. */
function layOut(pageTop: readonly number[], clientHeight: number) {
  const items = scroller().querySelectorAll("ol > li");
  items.forEach((item, index) => Object.defineProperty(item, "offsetTop", { configurable: true, value: pageTop[index] }));
  Object.defineProperty(scroller(), "clientHeight", { configurable: true, value: clientHeight });
}

describe("PageViewer (FEAT-07, StyleGuide §5)", () => {
  it("shows the stored images, a notice for a page without one, and the legend", () => {
    renderViewer();
    const shown = screen.getByRole("img", { name: "Page 1 of your CV" });
    expect(shown).toHaveAttribute("src", "blob:test");
    expect(screen.getByText("No image for this page.")).toBeInTheDocument();
    const legend = within(screen.getByRole("list", { name: "Highlight colors" }));
    expect(legend.getByText("Must change")).toBeInTheDocument();
    expect(legend.getByText("Suggested or optional")).toBeInTheDocument();
  });

  it("leaves the legend out when nothing is highlighted, and can be scrolled from the keyboard", () => {
    renderViewer({ marks: [] });
    expect(screen.queryByRole("list", { name: "Highlight colors" })).not.toBeInTheDocument();
    expect(scroller()).toHaveAttribute("tabindex", "0");
  });

  it("steps through the pages and stops at both ends (P5-D3)", () => {
    renderViewer();
    const controls = within(screen.getByRole("group", { name: "Page controls" }));
    const previous = controls.getByRole("button", { name: "Previous page" });
    const next = controls.getByRole("button", { name: "Next page" });
    expect(counter()).toHaveTextContent("Page 1 of 3");
    expect(previous).toBeDisabled();
    fireEvent.click(next);
    fireEvent.click(next);
    expect(counter()).toHaveTextContent("Page 3 of 3");
    expect(next).toBeDisabled();
    expect(scrollTo).toHaveBeenCalledTimes(2);
    fireEvent.click(previous);
    expect(counter()).toHaveTextContent("Page 2 of 3");
  });

  it("follows the page at the middle of the window while the user scrolls", () => {
    renderViewer();
    layOut([0, 800, 1600], 600);
    scroller().scrollTop = 600;
    fireEvent.scroll(scroller());
    expect(counter()).toHaveTextContent("Page 2 of 3");
    scroller().scrollTop = 1400;
    fireEvent.scroll(scroller());
    expect(counter()).toHaveTextContent("Page 3 of 3");
  });

  it("keeps the page it was sent to while its own scroll is still running (G5-02)", () => {
    vi.useFakeTimers();
    renderViewer();
    layOut([0, 800, 1600], 600);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    // Halfway through the smooth scroll the middle of the window is still on page 1.
    scroller().scrollTop = 100;
    fireEvent.scroll(scroller());
    expect(counter()).toHaveTextContent("Page 3 of 3");
    act(() => vi.advanceTimersByTime(500));
    scroller().scrollTop = 600;
    fireEvent.scroll(scroller());
    expect(counter()).toHaveTextContent("Page 2 of 3");
  });

  it("zooms in three steps by widening the pages inside the viewer only", () => {
    renderViewer();
    const zoom = within(screen.getByRole("group", { name: "Zoom" }));
    const list = scroller().querySelector("ol");
    expect(zoom.getByRole("button", { name: "Fit width" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(zoom.getByRole("button", { name: "200%" }));
    expect(zoom.getByRole("button", { name: "200%" })).toHaveAttribute("aria-pressed", "true");
    expect(list).toHaveStyle({ width: "200%" });
    fireEvent.click(zoom.getByRole("button", { name: "150%" }));
    expect(list).toHaveStyle({ width: "150%" });
  });

  it("marks the current page number in the pager, not the previous arrow", () => {
    renderViewer();
    const pager = within(screen.getByRole("navigation", { name: "Pages" }));
    expect(pager.getByRole("button", { name: "Page 1 of 3" })).toHaveAttribute("aria-current", "page");
    expect(pager.getByRole("button", { name: "Previous page" })).not.toHaveAttribute("aria-current");
    fireEvent.click(pager.getByRole("button", { name: "Page 3 of 3" }));
    expect(pager.getByRole("button", { name: "Page 3 of 3" })).toHaveAttribute("aria-current", "page");
    expect(pager.getByRole("button", { name: "Page 1 of 3" })).not.toHaveAttribute("aria-current");
  });

  it("draws each highlight at its share of the image in page order, red for high and yellow otherwise (BR-08)", () => {
    renderViewer();
    const [first, second, third] = screen.getAllByRole("button", { name: /^(Must change|Suggested|Optional): / });
    expect(first).toHaveAccessibleName("Must change: Rewrite the summary");
    expect(first).toHaveStyle({ left: "10%", top: "12%", width: "50%", height: "2%" });
    expect(first.className).toContain("bg-critical/25");
    expect(second).toHaveAccessibleName("Suggested: Add a number");
    expect(second.className).toContain("bg-advisory/25");
    expect(third).toHaveAccessibleName("Optional: Tighten a bullet");
  });

  it("puts the enlarged targets beneath every visible box (G5-01)", () => {
    const { onSelectHighlight } = renderViewer();
    const overlay = screen.getByRole("button", { name: "Must change: Rewrite the summary" }).closest(".absolute.inset-0");
    const [targets] = Array.from(overlay?.children ?? []);
    expect(targets).toHaveAttribute("aria-hidden", "true");
    const target = targets?.querySelector<HTMLElement>('[style*="top: 41%"]');
    expect(target?.className).toContain("min-h-11");
    fireEvent.click(target!);
    expect(onSelectHighlight).toHaveBeenCalledWith("sug-02");
  });

  it("reports the highlight a user picks, from the button or from its second line", () => {
    const { onSelectHighlight } = renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "Must change: Rewrite the summary" }));
    const secondLine = document.querySelector<HTMLElement>('[aria-hidden="true"][style*="top: 14%"]');
    fireEvent.click(secondLine!);
    expect(onSelectHighlight).toHaveBeenNthCalledWith(1, "sug-01");
    expect(onSelectHighlight).toHaveBeenNthCalledWith(2, "sug-01");
  });

  it("thickens the border of the highlight whose card control is in use", () => {
    renderViewer({ emphasizedId: "sug-02" });
    expect(screen.getByRole("button", { name: "Suggested: Add a number" }).className).toContain("border-[2.5px]");
    expect(screen.getByRole("button", { name: "Must change: Rewrite the summary" }).className).toContain("border-[1.5px]");
  });

  it("turns to a highlight's page, brings the whole viewer into view, and centers the highlight (AC-07.2)", () => {
    const { ref } = renderViewer();
    const target = document.getElementById("t-highlight-sug-03")!;
    vi.spyOn(scroller(), "getBoundingClientRect").mockReturnValue(new DOMRect(100, 200, 400, 300));
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(150, 800, 40, 10));
    Object.defineProperty(scroller(), "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(scroller(), "clientWidth", { configurable: true, value: 400 });
    scroller().scrollTop = 50;

    act(() => ref.current?.showHighlight("sug-03"));

    expect(counter()).toHaveTextContent("Page 2 of 3");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole("group", { name: "Page controls" }).parentElement);
    // 50 + (800 - 200) - (300 - 10) / 2 = 505, and 0 + (150 - 100) - (400 - 40) / 2 = -130.
    expect(scrollTo).toHaveBeenCalledWith({ top: 505, left: -130, behavior: "smooth" });
  });

  it("draws one box for cards that quote the same line, led by the most urgent card (DELTA-63)", () => {
    const line = { left: 10, top: 60, width: 40, height: 2 };
    const shared: InspectorMark[] = [
      { id: "sug-07", priority: "low", title: "Shorten the line", pageNumber: 1, rects: [line] },
      { id: "sug-05", priority: "high", title: "Use an active verb", pageNumber: 1, rects: [{ ...line, left: 10.01 }] },
    ];
    const { onSelectHighlight, ref } = renderViewer({ marks: [...marks, ...shared] });
    const box = screen.getByRole("button", { name: "Must change: Use an active verb; Optional: Shorten the line" });

    expect(document.getElementById("t-highlight-sug-07")).toBeNull();
    expect(box.id).toBe("t-highlight-sug-05");
    expect(box.className).toContain("border-critical-strong");
    fireEvent.click(box);
    expect(onSelectHighlight).toHaveBeenCalledWith("sug-05");

    act(() => ref.current?.showHighlight("sug-07"));
    // The pulse gives the button a new key, so it is looked up again.
    expect(document.getElementById("t-highlight-sug-05")?.className).toContain("border-[2.5px]");
  });

  it("keeps the pointed box's border thick for 1.5 s, with and without motion (G5-05)", () => {
    vi.useFakeTimers();
    const { ref } = renderViewer({ reduceMotion: true });
    act(() => ref.current?.showHighlight("sug-01"));
    const box = () => screen.getByRole("button", { name: "Must change: Rewrite the summary" });
    expect(box().className).toContain("border-[2.5px]");
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
    act(() => vi.advanceTimersByTime(1500));
    expect(box().className).toContain("border-[1.5px]");
  });

  it("restarts the pulse each time a card points at the same highlight", () => {
    const { ref } = renderViewer();
    act(() => ref.current?.showHighlight("sug-01"));
    const first = screen.getByRole("button", { name: "Must change: Rewrite the summary" });
    act(() => ref.current?.showHighlight("sug-01"));
    // A new element means Motion plays the pulse again from the start.
    expect(screen.getByRole("button", { name: "Must change: Rewrite the summary" })).not.toBe(first);
  });

  it("ignores an unknown highlight", () => {
    const { ref } = renderViewer();
    act(() => ref.current?.showHighlight("sug-99"));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(counter()).toHaveTextContent("Page 1 of 3");
  });

  it("revokes the object URLs when the images go away", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { unmount } = renderWithI18n(
      <PageViewer pages={pages} marks={[]} idPrefix="t" emphasizedId={null} reduceMotion={false} onSelectHighlight={vi.fn()} />,
    );
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });
});
