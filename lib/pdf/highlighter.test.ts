import { describe, expect, it } from "vitest";
import type { DocumentRun } from "@/types/api";
import {
  highlightsFor,
  locateHighlights,
  pageMapsToImage,
  placeHighlights,
  toImageRect,
  type HighlightPage,
  type HighlightSource,
} from "./highlighter";

const PAGE = { x0: 0, y0: 0, x1: 612, y1: 792 };

interface RunSpec {
  text: string;
  page?: number;
  x?: number;
  y: number;
  width?: number;
  fontSize?: number;
  hidden?: boolean;
  /** What rawText holds before this run: the separator the extractor wrote. */
  before?: string;
}

/** Builds rawText and runs the way assembleText does: each run's text sits at its offsets. */
function source(specs: readonly RunSpec[]): HighlightSource {
  let rawText = "";
  const runs: DocumentRun[] = specs.map((spec, index) => {
    rawText += index === 0 ? "" : (spec.before ?? " ");
    const textStart = rawText.length;
    rawText += spec.text;
    return {
      pageNumber: spec.page ?? 1,
      x: spec.x ?? 72,
      y: spec.y,
      width: spec.width ?? spec.text.length * 6,
      fontSize: spec.fontSize ?? 10,
      hidden: spec.hidden ?? false,
      textStart,
      textEnd: rawText.length,
    };
  });
  return { rawText, runs };
}

const suggestion = (id: string, targetTextSnippet: string, pageNumber?: number) => ({ id, targetTextSnippet, pageNumber });

describe("locateHighlights (architecture §7.6)", () => {
  it("finds a snippet split across runs on one line and merges it into one box", () => {
    const doc = source([
      { text: "Responsible", y: 700, x: 72, width: 60 },
      { text: "for sales", y: 700, x: 135, width: 45 },
    ]);
    const located = locateHighlights(doc, [suggestion("sug-01", "Responsible for sales")]);

    expect(located["sug-01"]?.pageNumber).toBe(1);
    expect(located["sug-01"]?.boxes).toHaveLength(1);
    const [box] = located["sug-01"]!.boxes;
    expect(box.x0).toBeCloseTo(71);
    expect(box.x1).toBeCloseTo(181);
    expect(box.y0).toBeCloseTo(698);
    expect(box.y1).toBeCloseTo(708);
  });

  it("follows a snippet across a line wrap, with one box per line", () => {
    const doc = source([
      { text: "Wrote technical documents", y: 700 },
      { text: "for the mobile team.", y: 686, before: "\n" },
    ]);
    const located = locateHighlights(doc, [suggestion("sug-01", "documents for the mobile")]);

    expect(located["sug-01"]?.boxes).toHaveLength(2);
    expect(located["sug-01"]?.boxes[0].y0).toBeGreaterThan(located["sug-01"]!.boxes[1].y0);
  });

  it("ignores irregular whitespace in the PDF and in the snippet", () => {
    const doc = source([{ text: "Led   a\tteam of five", y: 700 }]);
    expect(locateHighlights(doc, [suggestion("sug-01", "  Led a team\nof five ")])["sug-01"]).toBeDefined();
  });

  it("gives a run covered only in part its share of the width", () => {
    const doc = source([{ text: "Skills: React, Node", y: 700, x: 100, width: 190 }]);
    const [box] = locateHighlights(doc, [suggestion("sug-01", "React")])["sug-01"]!.boxes;

    // "React" is characters 8 to 13 of 19; each character is 10 pt wide here, plus 1 pt padding.
    expect(box.x0).toBeCloseTo(179);
    expect(box.x1).toBeCloseTo(231);
  });

  it("tries the stored page first and falls back to the others", () => {
    const doc = source([
      { text: "Team lead", y: 700, page: 1 },
      { text: "Team lead", y: 500, page: 2 },
      { text: "Only here", y: 400, page: 2 },
    ]);
    const located = locateHighlights(doc, [suggestion("a", "Team lead", 2), suggestion("b", "Only here", 1)]);

    expect(located.a).toMatchObject({ pageNumber: 2 });
    expect(located.a?.boxes[0].y0).toBeCloseTo(498);
    expect(located.b).toMatchObject({ pageNumber: 2 });
  });

  it("keeps visible suggestions off hidden text, and places the hidden-text notice on it", () => {
    const doc = source([
      { text: "Visible summary", y: 700 },
      { text: "Kubernetes expert", y: 20, hidden: true },
      { text: "React", y: 20, x: 200, hidden: true, before: "" },
    ]);
    const located = locateHighlights(doc, [
      suggestion("sug-01", "Kubernetes expert"),
      // Hidden samples join runs with a space even where the PDF has none.
      suggestion("hidden-text", "Kubernetes expert React", 1),
    ]);

    expect(located["sug-01"]).toBeUndefined();
    expect(located["hidden-text"]?.boxes).toHaveLength(1);
  });

  it("prefers an exact match on another page over a space-blind match on the stored page (G5-04)", () => {
    const doc = source([
      { text: "JavaScript developer", y: 700, page: 1 },
      { text: "Java Script developer", y: 500, page: 2 },
    ]);
    expect(locateHighlights(doc, [suggestion("sug-01", "Java Script developer", 1)])["sug-01"]).toMatchObject({ pageNumber: 2 });
    // With no exact match anywhere, ignoring spaces still finds it.
    expect(locateHighlights(doc, [suggestion("sug-02", "JavaScriptdeveloper", 2)])["sug-02"]).toMatchObject({ pageNumber: 2 });
  });

  it("skips suggestions without a snippet, snippets that are not there, and documents without runs", () => {
    const doc = source([{ text: "Budi Santoso", y: 760 }]);
    expect(locateHighlights(doc, [{ id: "sug-01" }, suggestion("sug-02", "Not in the CV"), suggestion("sug-03", "  ")])).toEqual({});
    expect(locateHighlights({ rawText: "", runs: [] }, [suggestion("sug-01", "Budi")])).toEqual({});
  });
});

describe("placing boxes on the page image (architecture §7.7)", () => {
  const page: HighlightPage = { pageNumber: 1, box: PAGE, rotation: 0, image: { width: 1240, height: 1605 } };

  it("maps page points to a share of the image, flipping the y axis", () => {
    const rect = toImageRect({ x0: 61.2, y0: 712.8, x1: 306, y1: 752.4 }, PAGE);
    expect(rect.left).toBeCloseTo(10);
    expect(rect.width).toBeCloseTo(40);
    expect(rect.top).toBeCloseTo(5);
    expect(rect.height).toBeCloseTo(5);
  });

  it("respects a page box that does not start at the origin", () => {
    const rect = toImageRect({ x0: 110, y0: 90, x1: 160, y1: 140 }, { x0: 10, y0: 40, x1: 510, y1: 540 });
    expect(rect).toEqual({ left: 20, top: 80, width: 10, height: 10 });
  });

  it("clamps boxes that reach past the page edge", () => {
    const rect = toImageRect({ x0: -10, y0: 780, x1: 50, y1: 800 }, PAGE);
    expect(rect.left).toBe(0);
    expect(rect.top).toBe(0);
  });

  it("draws nothing on a page without an image, a rotated page, or an image of another shape (P5-T4, DELTA-55)", () => {
    expect(pageMapsToImage(page)).toBe(true);
    expect(pageMapsToImage({ ...page, image: null })).toBe(false);
    expect(pageMapsToImage({ ...page, image: { width: 1605, height: 1240 } })).toBe(false);
    // Turned upside down the page keeps its shape, so only the rotation gives it away.
    expect(pageMapsToImage({ ...page, rotation: 180 })).toBe(false);
    expect(pageMapsToImage({ ...page, rotation: 90, box: { x0: 0, y0: 0, x1: 600, y1: 600 }, image: { width: 1000, height: 1000 } })).toBe(false);
    expect(pageMapsToImage({ ...page, box: { x0: 0, y0: 0, x1: 0, y1: 792 } })).toBe(false);
  });

  it("keeps only the highlights it can draw", () => {
    const located = {
      a: { pageNumber: 1, boxes: [{ x0: 72, y0: 698, x1: 180, y1: 708 }] },
      b: { pageNumber: 2, boxes: [{ x0: 72, y0: 698, x1: 180, y1: 708 }] },
    };
    const placed = placeHighlights(located, [page, { pageNumber: 2, box: PAGE, rotation: 0, image: null }]);

    expect(Object.keys(placed)).toEqual(["a"]);
    expect(placed.a?.rects[0].top).toBeCloseTo(((792 - 708) / 792) * 100);
  });

  it("goes from stored runs to drawable rectangles in one call", () => {
    const doc = source([{ text: "Responsible for sales", y: 700 }]);
    const placed = highlightsFor(doc, [suggestion("sug-01", "Responsible for sales", 1)], [page]);
    expect(placed["sug-01"]).toMatchObject({ pageNumber: 1 });
    expect(JSON.stringify(placed)).not.toContain("Responsible");
  });
});
