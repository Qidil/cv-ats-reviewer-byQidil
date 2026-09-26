import {
  nonSpaceLength,
  type HiddenReason,
  type HiddenTextSample,
  type HiddenTextSummary,
  type PdfBox,
} from "@/lib/pdf/types";
import { intersectBoxes } from "@/lib/pdf/walker";

export const IGNORED_OPEN = "[IGNORED]";
export const IGNORED_CLOSE = "[/IGNORED]";

/** BR-02. On a white page the limit falls between grey 229 and 230, close to the old RGB > 230 rule. */
export const HIDDEN_CONTRAST_MAX = 1.25;
export const HIDDEN_FONT_SIZE_MAX = 2;
export const HIDDEN_ALPHA_MAX = 0.1;
export const OCR_IMAGE_COVERAGE_MIN = 0.5;

const PAGE_BACKGROUND = "#ffffff";
const OFF_PAGE_TOLERANCE = 1;
/** A shape this transparent paints nothing a reader would see. */
const SHAPE_INVISIBLE_ALPHA = 0.05;
/** Below this opacity the blended background color is unknown. */
const SHAPE_OPAQUE_ALPHA = 0.9;
const SAMPLE_MAX_LENGTH = 80;
const SAMPLE_LIMIT = 3;

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a #rrggbb color. */
export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface VisibilityInput {
  x: number;
  y: number;
  width: number;
  fontSize: number;
  color: string | null;
  alpha: number;
  renderMode: number;
  order: number;
}

export interface BackgroundShape {
  box: PdfBox;
  kind: "fill" | "image" | "shading";
  color: string | null;
  alpha: number;
  order: number;
}

function contains(box: PdfBox, x: number, y: number): boolean {
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
}

/** Color behind a point, or null when an image, gradient, pattern, or translucent shape makes it unknown. */
function backgroundAt(x: number, y: number, order: number, shapes: readonly BackgroundShape[]): string | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (shape.order > order || shape.alpha < SHAPE_INVISIBLE_ALPHA || !contains(shape.box, x, y)) {
      continue;
    }
    if (shape.kind !== "fill" || shape.color === null || shape.alpha < SHAPE_OPAQUE_ALPHA) {
      return null;
    }
    return shape.color;
  }
  return PAGE_BACKGROUND;
}

/** BR-02 reasons a run cannot be seen; an empty list means visible. */
export function classifyRunVisibility(
  run: VisibilityInput,
  shapes: readonly BackgroundShape[],
  pageBox: PdfBox,
): HiddenReason[] {
  const reasons: HiddenReason[] = [];
  if (run.renderMode === 3 || run.renderMode === 7) {
    reasons.push("invisible-mode");
  }
  if (run.alpha < HIDDEN_ALPHA_MAX) {
    reasons.push("transparent");
  }
  if (run.fontSize <= HIDDEN_FONT_SIZE_MAX) {
    reasons.push("tiny-font");
  }
  if (
    run.x < pageBox.x0 - OFF_PAGE_TOLERANCE ||
    run.x > pageBox.x1 + OFF_PAGE_TOLERANCE ||
    run.y < pageBox.y0 - OFF_PAGE_TOLERANCE ||
    run.y > pageBox.y1 + OFF_PAGE_TOLERANCE
  ) {
    reasons.push("off-page");
  }
  if (run.color !== null) {
    const background = backgroundAt(run.x + run.width / 2, run.y + run.fontSize * 0.3, run.order, shapes);
    if (background !== null && contrastRatio(run.color, background) < HIDDEN_CONTRAST_MAX) {
      reasons.push("low-contrast");
    }
  }
  return reasons;
}

function area(box: PdfBox): number {
  return Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);
}

/**
 * A scanned page with OCR: every text run is invisible and an image covers most of the page.
 * That text is what a reader sees in the image, so it counts as visible (BR-02).
 */
export function isOcrLayerPage(
  runs: ReadonlyArray<{ text: string; reasons: readonly HiddenReason[] }>,
  shapes: readonly BackgroundShape[],
  pageBox: PdfBox,
): boolean {
  const textRuns = runs.filter((run) => /\S/.test(run.text));
  if (textRuns.length === 0 || !textRuns.every((run) => run.reasons.includes("invisible-mode"))) {
    return false;
  }
  const pageArea = area(pageBox);
  return (
    pageArea > 0 &&
    shapes.some(
      (shape) =>
        shape.kind === "image" && area(intersectBoxes(pageBox, shape.box)) / pageArea >= OCR_IMAGE_COVERAGE_MIN,
    )
  );
}

const RUN_BREAKS = /[\t\n\r\v\f]/g;
/** rules.md §5.2: control, zero-width, soft hyphen, and bidi control characters. */
const INVISIBLE_CHARACTERS =
  /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

/** Cleans one run before assembly, so offsets and every derived text agree. */
export function cleanRunText(text: string): string {
  return text.replace(RUN_BREAKS, " ").replace(INVISIBLE_CHARACTERS, "");
}

/** Run text written into sanitizedText can never form an [IGNORED] marker, not even across runs. */
export function neutralizeMarkers(text: string): string {
  return text.replace(/\[/g, "(").replace(/\]/g, ")");
}

/** Removes [IGNORED]...[/IGNORED] blocks so hidden text can never be scored or sent to the AI. */
export function stripIgnored(text: string): string {
  return text
    .replace(/\[IGNORED\][\s\S]*?\[\/IGNORED\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n");
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

export function summarizeHiddenText(
  runs: ReadonlyArray<{ text: string; pageNumber: number; hiddenReasons: readonly HiddenReason[] }>,
  checked: boolean,
): HiddenTextSummary {
  const reasons = new Set<HiddenReason>();
  const groups: HiddenTextSample[] = [];
  let runCount = 0;
  let charCount = 0;
  let previousHidden = false;

  for (const run of runs) {
    const hidden = run.hiddenReasons.length > 0;
    if (hidden) {
      runCount++;
      charCount += nonSpaceLength(run.text);
      run.hiddenReasons.forEach((reason) => reasons.add(reason));
      const last = groups[groups.length - 1];
      if (previousHidden && last !== undefined && last.pageNumber === run.pageNumber) {
        last.text = `${last.text} ${run.text.trim()}`.trim();
      } else {
        groups.push({ text: run.text.trim(), pageNumber: run.pageNumber });
      }
    }
    previousHidden = hidden;
  }

  const withWords = groups.filter((group) => WORD_CHARACTER.test(group.text));
  return {
    checked,
    runCount,
    charCount,
    hasWords: withWords.length > 0,
    reasons: [...reasons],
    samples: withWords
      .slice(0, SAMPLE_LIMIT)
      .map((group) => ({ text: group.text.slice(0, SAMPLE_MAX_LENGTH).trim(), pageNumber: group.pageNumber })),
  };
}
