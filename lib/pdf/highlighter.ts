import type { DocumentRun } from "@/types/api";
import type { Suggestion } from "@/types/ats";
import type { PageRotation, PdfBox } from "./types";

/*
 * Architecture §7, items 6 and 7: places each suggestion's verbatim snippet on the page images.
 * Pure TypeScript with no pdf.js, so it runs in the browser on fresh and stored results.
 */

/** What the matching reads. The run text is only ever sliced here; callers get boxes back, never text. */
export interface HighlightSource {
  rawText: string;
  runs: readonly DocumentRun[];
}

/** One suggestion's snippet, found on one page, as boxes in PDF points (origin at the bottom-left). */
export interface LocatedHighlight {
  pageNumber: number;
  boxes: PdfBox[];
}

/** A box as a share of its page image, in percent, so zoom and resizing need no recomputation (P5-T5). */
export interface ImageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlacedHighlight {
  pageNumber: number;
  rects: ImageRect[];
}

export interface HighlightPage {
  pageNumber: number;
  box: PdfBox;
  /** DELTA-55: run boxes are in unrotated page space, so a rotated page cannot take them. */
  rotation: PageRotation;
  image: { width: number; height: number } | null;
}

const EDGE_QUOTES = /^["'\u201c\u201d\u2018\u2019\u00ab\u00bb]+|["'\u201c\u201d\u2018\u2019\u00ab\u00bb]+$/g;
/** Share of the font size above and below the baseline; runs carry no height (P5-T3). */
const ASCENT = 0.8;
const DESCENT = 0.2;
/** Proportional character widths drift a little, so each box reaches this share of the font size past its text. */
const SIDE_PADDING = 0.1;
/** Two boxes whose baselines differ by less than this share of the smaller font sit on one line. */
const SAME_LINE = 0.5;
/** An image of another shape than its page box cannot be mapped reliably either (P5-T4). */
const MAX_ASPECT_DRIFT = 0.02;

interface CharAt {
  run: number;
  offset: number;
}

interface PageText {
  text: string;
  /** One entry per character of `text`; null for a space that only separates two runs. */
  chars: Array<CharAt | null>;
  /** The same characters without spaces, built on first use by the fallback search. */
  compact?: { text: string; chars: CharAt[] };
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The page's text in reading order with whitespace collapsed, and where each character came from. */
function pageText(source: HighlightSource, runIndexes: readonly number[]): PageText {
  let text = "";
  const chars: Array<CharAt | null> = [];
  const push = (char: string, at: CharAt | null) => {
    if (/\s/.test(char)) {
      if (text === "" || text.endsWith(" ")) {
        return;
      }
      text += " ";
    } else {
      text += char;
    }
    chars.push(at);
  };
  let previousEnd: number | null = null;
  for (const index of runIndexes) {
    const run = source.runs[index];
    // Mirrors assembleText's visibleText: whitespace between two runs becomes one space.
    if (previousEnd !== null && /\s/.test(source.rawText.slice(previousEnd, run.textStart))) {
      push(" ", null);
    }
    const runText = source.rawText.slice(run.textStart, run.textEnd);
    for (let offset = 0; offset < runText.length; offset++) {
      push(runText[offset], { run: index, offset });
    }
    previousEnd = run.textEnd;
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    chars.pop();
  }
  return { text, chars };
}

function findExact(page: PageText, needle: string): CharAt[] | null {
  const start = page.text.indexOf(needle);
  return start >= 0 ? page.chars.slice(start, start + needle.length).filter((char): char is CharAt => char !== null) : null;
}

/** Ignores spaces: hidden-text samples join runs with a space where the PDF has none. */
function findIgnoringSpaces(page: PageText, needle: string): CharAt[] | null {
  const compactNeedle = needle.replace(/ /g, "");
  if (compactNeedle === "") {
    return null;
  }
  if (page.compact === undefined) {
    let text = "";
    const chars: CharAt[] = [];
    for (let index = 0; index < page.text.length; index++) {
      const at = page.chars[index];
      if (page.text[index] !== " " && at !== null && at !== undefined) {
        text += page.text[index];
        chars.push(at);
      }
    }
    page.compact = { text, chars };
  }
  const start = page.compact.text.indexOf(compactNeedle);
  return start >= 0 ? page.compact.chars.slice(start, start + compactNeedle.length) : null;
}

interface LineBox {
  box: PdfBox;
  baseline: number;
  fontSize: number;
}

/** A run covered only in part gets the part's share of its width (P5-T3); boxes on one line merge. */
function boxesFor(source: HighlightSource, matched: readonly CharAt[]): PdfBox[] {
  const spans = new Map<number, { from: number; to: number }>();
  for (const { run, offset } of matched) {
    const span = spans.get(run);
    spans.set(run, span === undefined ? { from: offset, to: offset + 1 } : { from: Math.min(span.from, offset), to: Math.max(span.to, offset + 1) });
  }
  const lines: LineBox[] = [];
  for (const [index, span] of [...spans.entries()].sort(([a], [b]) => a - b)) {
    const run = source.runs[index];
    const length = Math.max(1, run.textEnd - run.textStart);
    const pad = run.fontSize * SIDE_PADDING;
    const box: PdfBox = {
      x0: run.x + (run.width * span.from) / length - pad,
      y0: run.y - run.fontSize * DESCENT,
      x1: run.x + (run.width * span.to) / length + pad,
      y1: run.y + run.fontSize * ASCENT,
    };
    const last = lines.at(-1);
    if (last !== undefined && Math.abs(last.baseline - run.y) < Math.min(last.fontSize, run.fontSize) * SAME_LINE) {
      last.box = {
        x0: Math.min(last.box.x0, box.x0),
        y0: Math.min(last.box.y0, box.y0),
        x1: Math.max(last.box.x1, box.x1),
        y1: Math.max(last.box.y1, box.y1),
      };
    } else {
      lines.push({ box, baseline: run.y, fontSize: run.fontSize });
    }
  }
  return lines.map((line) => line.box);
}

/**
 * Same whitespace rule as the server (P5-T2), stored page first. The hidden-text notice searches
 * hidden runs; everything else only visible runs.
 */
export function locateHighlights(
  source: HighlightSource,
  suggestions: readonly Pick<Suggestion, "id" | "targetTextSnippet" | "pageNumber">[],
): Record<string, LocatedHighlight> {
  const byPage = new Map<string, number[]>();
  source.runs.forEach((run, index) => {
    const key = `${run.pageNumber}:${run.hidden ? "hidden" : "visible"}`;
    const list = byPage.get(key) ?? [];
    list.push(index);
    byPage.set(key, list);
  });
  const pageNumbers = [...new Set(source.runs.map((run) => run.pageNumber))].sort((a, b) => a - b);
  const texts = new Map<string, PageText>();
  const textOf = (pageNumber: number, hidden: boolean) => {
    const key = `${pageNumber}:${hidden ? "hidden" : "visible"}`;
    let text = texts.get(key);
    if (text === undefined) {
      const indexes = [...(byPage.get(key) ?? [])].sort((a, b) => source.runs[a].textStart - source.runs[b].textStart);
      text = pageText(source, indexes);
      texts.set(key, text);
    }
    return text;
  };

  const located: Record<string, LocatedHighlight> = {};
  for (const suggestion of suggestions) {
    const needle = collapse((suggestion.targetTextSnippet ?? "").trim().replace(EDGE_QUOTES, ""));
    if (needle === "") {
      continue;
    }
    const hidden = suggestion.id === "hidden-text";
    const order = [
      ...pageNumbers.filter((page) => page === suggestion.pageNumber),
      ...pageNumbers.filter((page) => page !== suggestion.pageNumber),
    ];
    // G5-04: an exact match on any page beats a match that ignores spaces on the stored page.
    search: for (const find of [findExact, findIgnoringSpaces]) {
      for (const pageNumber of order) {
        const matched = find(textOf(pageNumber, hidden), needle);
        if (matched !== null && matched.length > 0) {
          located[suggestion.id] = { pageNumber, boxes: boxesFor(source, matched) };
          break search;
        }
      }
    }
  }
  return located;
}

/** False for a page without an image, a rotated page (DELTA-55), or an image of another shape than its box. */
export function pageMapsToImage(page: HighlightPage): boolean {
  if (page.rotation !== 0 || page.image === null || page.image.width <= 0 || page.image.height <= 0) {
    return false;
  }
  const boxWidth = page.box.x1 - page.box.x0;
  const boxHeight = page.box.y1 - page.box.y0;
  if (boxWidth <= 0 || boxHeight <= 0) {
    return false;
  }
  const drift = boxWidth / boxHeight / (page.image.width / page.image.height);
  return Math.abs(drift - 1) <= MAX_ASPECT_DRIFT;
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

/** Page points to a share of the image: x grows to the right, y grows upward in the PDF and downward on screen. */
export function toImageRect(box: PdfBox, pageBox: PdfBox): ImageRect {
  const width = pageBox.x1 - pageBox.x0;
  const height = pageBox.y1 - pageBox.y0;
  const left = clampPercent(((box.x0 - pageBox.x0) / width) * 100);
  const right = clampPercent(((box.x1 - pageBox.x0) / width) * 100);
  const top = clampPercent(((pageBox.y1 - box.y1) / height) * 100);
  const bottom = clampPercent(((pageBox.y1 - box.y0) / height) * 100);
  return { left, top, width: right - left, height: bottom - top };
}

/** The highlights that can be drawn: located, on a page with an image that maps onto its box. */
export function placeHighlights(
  located: Readonly<Record<string, LocatedHighlight>>,
  pages: readonly HighlightPage[],
): Record<string, PlacedHighlight> {
  const drawable = new Map(pages.filter(pageMapsToImage).map((page) => [page.pageNumber, page]));
  const placed: Record<string, PlacedHighlight> = {};
  for (const [id, highlight] of Object.entries(located)) {
    const page = drawable.get(highlight.pageNumber);
    if (page === undefined) {
      continue;
    }
    const rects = highlight.boxes.map((box) => toImageRect(box, page.box)).filter((rect) => rect.width > 0 && rect.height > 0);
    if (rects.length > 0) {
      placed[id] = { pageNumber: highlight.pageNumber, rects };
    }
  }
  return placed;
}

/** Located and placed in one call. */
export function highlightsFor(
  source: HighlightSource,
  suggestions: readonly Pick<Suggestion, "id" | "targetTextSnippet" | "pageNumber">[],
  pages: readonly HighlightPage[],
): Record<string, PlacedHighlight> {
  return placeHighlights(locateHighlights(source, suggestions), pages);
}
