import { IGNORED_CLOSE, IGNORED_OPEN, neutralizeMarkers } from "@/lib/ats/white-text";
import { nonSpaceLength, type FontUsage, type GraphicKind, type LayoutMetadata, type PdfBox, type TypographyMetadata } from "./types";

/** The subset of run fields text assembly and layout metrics need. */
export interface LayoutRun {
  text: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  hidden: boolean;
}

const SUBSET_PREFIX = /^[A-Z]{6}\+/;
const BOLD_WORDS = /bold|black|heavy/i;
const ITALIC_WORDS = /italic|oblique/i;

/** "ABCDEF+TimesNewRomanPS-BoldMT" -> { family: "Times New Roman", bold: true }. */
export function parseFontName(rawName: string): { family: string; bold: boolean; italic: boolean } {
  const name = rawName.replace(SUBSET_PREFIX, "").trim();
  if (name === "") {
    return { family: "Unknown", bold: false, italic: false };
  }
  const [familyPart = name, ...styleParts] = name.split(/[-,]/);
  const style = styleParts.join(" ");
  const family = familyPart
    .replace(/(PSMT|MT|PS)$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return {
    family: family === "" ? name : family,
    bold: BOLD_WORDS.test(style) || BOLD_WORDS.test(familyPart),
    italic: ITALIC_WORDS.test(style) || ITALIC_WORDS.test(familyPart),
  };
}

type Separator = "" | " " | "\n";

const SPACE_GAP_EM = 0.1;
const NEW_LINE_SHIFT_EM = 0.5;
const BACKWARD_JUMP_EM = 0.5;

function separatorBetween(prev: LayoutRun, next: LayoutRun): Separator {
  if (prev.pageNumber !== next.pageNumber) {
    return "\n";
  }
  const em = Math.max(prev.fontSize, next.fontSize, 1);
  if (Math.abs(next.y - prev.y) > em * NEW_LINE_SHIFT_EM) {
    return "\n";
  }
  const gap = next.x - (prev.x + prev.width);
  return gap > em * SPACE_GAP_EM || gap < -em * BACKWARD_JUMP_EM ? " " : "";
}

function stronger(a: Separator, b: Separator): Separator {
  if (a === "\n" || b === "\n") return "\n";
  if (a === " " || b === " ") return " ";
  return "";
}

function join(left: string, separator: Separator, right: string): string {
  if (separator === " " && (/\s$/.test(left) || /^\s/.test(right))) {
    return "";
  }
  return separator;
}

export interface AssembledText {
  rawText: string;
  sanitizedText: string;
  visibleText: string;
  /** [start, end) of each run inside rawText, in run order. */
  offsets: Array<[number, number]>;
}

/** Joins runs in content order, the same order pdf.js text content uses. */
export function assembleText(runs: readonly LayoutRun[]): AssembledText {
  let rawText = "";
  let sanitizedText = "";
  let visibleText = "";
  const offsets: Array<[number, number]> = [];
  let inHiddenBlock = false;
  let pendingVisibleSeparator: Separator = "";

  runs.forEach((run, index) => {
    const separator = index === 0 ? "" : separatorBetween(runs[index - 1], run);
    const hasText = /\S/.test(run.text);

    rawText += join(rawText, separator, run.text);
    offsets.push([rawText.length, rawText.length + run.text.length]);
    rawText += run.text;

    const safeText = neutralizeMarkers(run.text);
    if (run.hidden && hasText) {
      if (inHiddenBlock) {
        sanitizedText += join(sanitizedText, separator, safeText) + safeText;
      } else {
        sanitizedText += join(sanitizedText, separator, IGNORED_OPEN) + IGNORED_OPEN + safeText;
        inHiddenBlock = true;
      }
    } else if (inHiddenBlock && !hasText) {
      sanitizedText += join(sanitizedText, separator, safeText) + safeText;
    } else {
      if (inHiddenBlock) {
        sanitizedText += IGNORED_CLOSE;
        inHiddenBlock = false;
      }
      sanitizedText += join(sanitizedText, separator, safeText) + safeText;
    }

    pendingVisibleSeparator = stronger(pendingVisibleSeparator, separator);
    if (!run.hidden) {
      if (visibleText !== "") {
        visibleText += join(visibleText, pendingVisibleSeparator, run.text);
      }
      visibleText += run.text;
      pendingVisibleSeparator = "";
    }
  });

  if (inHiddenBlock) {
    sanitizedText += IGNORED_CLOSE;
  }
  return { rawText, sanitizedText, visibleText, offsets };
}

interface Line {
  y: number;
  runs: LayoutRun[];
}

const LINE_Y_TOLERANCE = 1;

/** Runs are sorted top to bottom, so a run can only join the line started just before it. */
function groupLines(runs: readonly LayoutRun[]): Line[] {
  const lines: Line[] = [];
  for (const run of [...runs].sort((a, b) => b.y - a.y)) {
    const line = lines.at(-1);
    if (line !== undefined && Math.abs(line.y - run.y) <= LINE_Y_TOLERANCE) {
      line.runs.push(run);
    } else {
      lines.push({ y: run.y, runs: [run] });
    }
  }
  return lines;
}

function byPage(runs: readonly LayoutRun[]): Map<number, LayoutRun[]> {
  const pages = new Map<number, LayoutRun[]>();
  for (const run of runs) {
    const list = pages.get(run.pageNumber) ?? [];
    list.push(run);
    pages.set(run.pageNumber, list);
  }
  return pages;
}

const LINE_SPACING_MIN_RATIO = 0.5;
const LINE_SPACING_MAX_RATIO = 3;

function lineSpacingRatios(lines: readonly Line[]): number[] {
  const ratios: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1].y - lines[i].y;
    const size = Math.max(...lines[i - 1].runs.map((r) => r.fontSize), ...lines[i].runs.map((r) => r.fontSize));
    if (size <= 0) continue;
    const ratio = gap / size;
    if (ratio >= LINE_SPACING_MIN_RATIO && ratio <= LINE_SPACING_MAX_RATIO) {
      ratios.push(ratio);
    }
  }
  return ratios;
}

const COLUMN_GAP_THRESHOLD = 50;
const COLUMN_MIN_LINES_PER_CLUSTER = 2;
const COLUMN_SHARED_LINES_MIN = 2;
const COLUMN_SPAN_MIN_RATIO = 0.5;
/**
 * Right-aligned dates share a few baselines with the main column; a real second column has text on
 * a large share of the lines within its own vertical span.
 */
const COLUMN_DENSITY_MIN = 0.35;
const ALIGNED_END_TOLERANCE = 2;
const RAGGED_START_MIN = 4;
const ANNOTATION_SHARE_MIN = 0.5;
const DATE_TEXT_MAX_LENGTH = 30;
const DATE_TEXT = /\b(?:19|20)\d{2}\b|\b(?:sekarang|saat ini|present|now|current)\b/i;

interface ColumnSample {
  x: number;
  end: number;
  line: number;
  text: string;
}

interface Cluster {
  maxX: number;
  lines: Set<number>;
  samples: ColumnSample[];
}

/**
 * Dates and places set flush right on job title lines annotate the main column: most of them end at
 * the same x while their starts differ, or most of them are dates.
 */
function isAnnotationCluster(samples: readonly ColumnSample[]): boolean {
  const ends = samples.map((sample) => sample.end).sort((a, b) => a - b);
  const medianEnd = ends[Math.floor(ends.length / 2)];
  const alignedEnds = ends.filter((end) => Math.abs(end - medianEnd) <= ALIGNED_END_TOLERANCE).length;
  const starts = samples.map((sample) => sample.x);
  const raggedStarts = Math.max(...starts) - Math.min(...starts) > RAGGED_START_MIN;
  if (raggedStarts && alignedEnds >= samples.length * ANNOTATION_SHARE_MIN) {
    return true;
  }
  const dates = samples.filter(
    (sample) => sample.text.trim().length <= DATE_TEXT_MAX_LENGTH && DATE_TEXT.test(sample.text),
  ).length;
  return dates >= samples.length * ANNOTATION_SHARE_MIN;
}

function detectColumns(lines: readonly Line[]): number {
  if (lines.length < COLUMN_MIN_LINES_PER_CLUSTER) {
    return 1;
  }
  const samples: ColumnSample[] = lines.flatMap((line, lineIndex) =>
    line.runs
      .filter((run) => /\S/.test(run.text))
      .map((run) => ({ x: run.x, end: run.x + run.width, line: lineIndex, text: run.text })),
  );
  samples.sort((a, b) => a.x - b.x);
  const clusters: Cluster[] = [];
  for (const sample of samples) {
    const last = clusters.at(-1);
    if (last !== undefined && sample.x - last.maxX <= COLUMN_GAP_THRESHOLD) {
      last.maxX = Math.max(last.maxX, sample.x);
      last.lines.add(sample.line);
      last.samples.push(sample);
    } else {
      clusters.push({ maxX: sample.x, lines: new Set([sample.line]), samples: [sample] });
    }
  }
  const significant = clusters.filter((cluster) => cluster.lines.size >= COLUMN_MIN_LINES_PER_CLUSTER);
  if (significant.length < 2) {
    return 1;
  }

  const lineY = (index: number) => lines[index].y;
  const primary = significant.reduce((a, b) => (b.lines.size > a.lines.size ? b : a));
  const primaryYs = [...primary.lines].map(lineY);
  const primarySpan = Math.max(...primaryYs) - Math.min(...primaryYs);
  if (primarySpan <= 0) {
    return 1;
  }
  let columns = 1;
  for (const cluster of significant) {
    if (cluster === primary) continue;
    const shared = [...cluster.lines].filter((line) => primary.lines.has(line)).length;
    if (shared < COLUMN_SHARED_LINES_MIN) continue;
    const ys = [...cluster.lines].map(lineY);
    const top = Math.max(...ys);
    const bottom = Math.min(...ys);
    if ((top - bottom) / primarySpan < COLUMN_SPAN_MIN_RATIO) continue;
    const primaryLinesInSpan = primaryYs.filter((y) => y <= top && y >= bottom).length;
    if (cluster.lines.size / Math.max(primaryLinesInSpan, 1) < COLUMN_DENSITY_MIN) continue;
    if (isAnnotationCluster(cluster.samples)) continue;
    columns++;
  }
  return columns;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** The tightest quarter of baseline gaps comes from wrapped lines; wider gaps add paragraph spacing. */
const LINE_SPACING_QUANTILE = 0.25;

function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(q * (sorted.length - 1))];
}

/** Typography of the visible text. Hidden runs must be filtered out by the caller. */
export function buildTypography(
  runs: readonly LayoutRun[],
  pageBoxes: ReadonlyMap<number, PdfBox>,
): TypographyMetadata {
  const textRuns = runs.filter((run) => /\S/.test(run.text));
  const usage = new Map<string, FontUsage>();
  for (const run of textRuns) {
    const size = round(run.fontSize, 2);
    const key = `${run.fontFamily}|${run.bold}|${run.italic}|${size}`;
    const entry = usage.get(key);
    if (entry) {
      entry.charCount += nonSpaceLength(run.text);
    } else {
      usage.set(key, {
        family: run.fontFamily,
        bold: run.bold,
        italic: run.italic,
        size,
        charCount: nonSpaceLength(run.text),
      });
    }
  }
  const fonts = [...usage.values()].sort((a, b) => b.charCount - a.charCount);
  const fontFamilies = [...new Set(fonts.map((font) => font.family))];
  const fontSizes = [...new Set(fonts.map((font) => font.size))].sort((a, b) => a - b);
  const bodyFont = fonts.find((font) => !font.bold && !font.italic && font.family !== "Unknown");
  const bodySize = bodyFont?.size ?? fontSizes.at(-1) ?? null;
  const titleSize = fontSizes.at(-1) ?? null;

  const bodyRuns = textRuns.filter((run) => bodySize === null || Math.abs(run.fontSize - bodySize) <= 0.5);
  const bodyChars = bodyRuns.reduce((sum, run) => sum + nonSpaceLength(run.text), 0);
  const styledShare = (predicate: (run: LayoutRun) => boolean) =>
    bodyChars > 0
      ? round(bodyRuns.filter(predicate).reduce((sum, run) => sum + nonSpaceLength(run.text), 0) / bodyChars, 3)
      : null;

  const ratios: number[] = [];
  const margins = { left: Infinity, right: Infinity, top: Infinity, bottom: Infinity };
  for (const [pageNumber, pageRuns] of byPage(textRuns)) {
    ratios.push(...lineSpacingRatios(groupLines(pageRuns)));
    const box = pageBoxes.get(pageNumber);
    if (!box) continue;
    for (const run of pageRuns) {
      margins.left = Math.min(margins.left, run.x - box.x0);
      margins.right = Math.min(margins.right, box.x1 - (run.x + run.width));
      margins.top = Math.min(margins.top, box.y1 - run.y);
      margins.bottom = Math.min(margins.bottom, run.y - box.y0);
    }
  }

  return {
    fonts,
    fontFamilies,
    fontSizes,
    bodySize,
    titleSize,
    lineSpacing: ratios.length > 0 ? round(quantile(ratios, LINE_SPACING_QUANTILE), 2) : null,
    margins: Number.isFinite(margins.left)
      ? {
          left: round(margins.left, 1),
          right: round(margins.right, 1),
          top: round(margins.top, 1),
          bottom: round(margins.bottom, 1),
        }
      : null,
    boldRatio: styledShare((run) => run.bold),
    italicRatio: styledShare((run) => run.italic),
  };
}

/** Layout of the visible text. Hidden runs must be filtered out by the caller. */
export function buildLayout(
  runs: readonly LayoutRun[],
  graphics: ReadonlySet<GraphicKind>,
  ocrPages: readonly number[],
): LayoutMetadata {
  let columnCount = 1;
  for (const pageRuns of byPage(runs.filter((run) => /\S/.test(run.text))).values()) {
    columnCount = Math.max(columnCount, detectColumns(groupLines(pageRuns)));
  }
  return { columnCount, hasGraphics: graphics.size > 0, graphics: [...graphics], ocrPages: [...ocrPages] };
}
