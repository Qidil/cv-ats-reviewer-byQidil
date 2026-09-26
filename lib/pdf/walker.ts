import type { GraphicKind, PdfBox } from "./types";

export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 × m2 in PDF's row-vector convention: apply m1 first, then m2. */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

export function applyToPoint(m: Matrix, x: number, y: number): [number, number] {
  return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
}

export function transformBox(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  m: Matrix,
): PdfBox {
  const corners = [
    applyToPoint(m, minX, minY),
    applyToPoint(m, maxX, minY),
    applyToPoint(m, minX, maxY),
    applyToPoint(m, maxX, maxY),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function intersectBoxes(a: PdfBox | null, b: PdfBox): PdfBox {
  if (a === null) {
    return b;
  }
  return {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
}

export interface FontInfo {
  family: string;
  bold: boolean;
  italic: boolean;
  /** fontMatrix[0]: glyph widths are in 1/1000 em for most fonts, other units for Type3. */
  fontMatrixScale: number;
}

export type FontResolver = (fontId: string) => FontInfo | null;

export interface OperatorListLike {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

export interface WalkedRun {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  font: FontInfo;
  color: string | null;
  alpha: number;
  renderMode: number;
  /** Paint order within the page; shapes with a lower order are behind the text. */
  order: number;
}

export interface PaintedShape {
  box: PdfBox;
  kind: "fill" | "image" | "shading";
  color: string | null;
  alpha: number;
  order: number;
}

export interface WalkResult {
  runs: WalkedRun[];
  shapes: PaintedShape[];
  graphics: GraphicKind[];
}

const UNKNOWN_FONT: FontInfo = { family: "Unknown", bold: false, italic: false, fontMatrixScale: 0.001 };

/** Same threshold pdf.js text content uses for the smallest gap that becomes a space. */
const SPACE_GAP_EM = 0.1;
/** A jump this large inside one TJ (right-aligned dates, tab stops) starts a new run so boxes stay tight. */
const RUN_SPLIT_GAP_EM = 1;
/** Shapes this thin or thinner are divider lines and underlines, never skill bars (P2-D5). */
const RULE_MAX_THICKNESS = 3;
const BAR_ASPECT_RATIO = 3;
/** Shapes wider or taller than this share of the page are backgrounds or rules, not skill bars. */
const BAR_MAX_PAGE_RATIO = 0.6;
const BAR_ALIGN_TOLERANCE = 2;
/** The track and the filled part of one skill bar share a center line. */
const BAR_SLOT_TOLERANCE = 1;
/** Skill bars in a list sit closer than this; accents under headings sit a whole section apart. */
const BAR_STACK_MAX_GAP = 36;
/** Images and gradients below this on either side are icons, spacers, or lines (P2-D5). */
const GRAPHIC_MIN_SIDE = 24;

const IMAGE_OPS = new Set([
  "paintImageXObject",
  "paintInlineImageXObject",
  "paintInlineImageXObjectGroup",
  "paintImageMaskXObject",
  "paintImageMaskXObjectGroup",
  "paintImageXObjectRepeat",
  "paintImageMaskXObjectRepeat",
  "paintSolidColorImageMask",
]);

const FILL_OPS = ["fill", "eoFill", "fillStroke", "eoFillStroke", "closeFillStroke", "closeEOFillStroke"];

interface GraphicsState {
  ctm: Matrix;
  fillColor: string | null;
  strokeColor: string | null;
  fillAlpha: number;
  strokeAlpha: number;
  font: FontInfo | null;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
  rise: number;
  renderMode: number;
  clip: PdfBox | null;
}

const opNameCache = new WeakMap<object, Map<number, string>>();

function opNames(ops: Record<string, number>): Map<number, string> {
  let names = opNameCache.get(ops);
  if (!names) {
    names = new Map(Object.entries(ops).map(([name, id]) => [id, name]));
    opNameCache.set(ops, names);
  }
  return names;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toNumbers(value: unknown, length: number): number[] | null {
  if (value === null || typeof value !== "object" || !("length" in value)) {
    return null;
  }
  const list = value as ArrayLike<unknown>;
  if (list.length < length) {
    return null;
  }
  const numbers: number[] = [];
  for (let i = 0; i < length; i++) {
    const item = list[i];
    if (typeof item !== "number" || !Number.isFinite(item)) {
      return null;
    }
    numbers.push(item);
  }
  return numbers;
}

function toMatrix(value: unknown): Matrix | null {
  const n = toNumbers(value, 6);
  return n ? [n[0], n[1], n[2], n[3], n[4], n[5]] : null;
}

function toHexColor(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

function isBarShaped(box: PdfBox, pageWidth: number, pageHeight: number): boolean {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  if (Math.min(width, height) <= RULE_MAX_THICKNESS) {
    return false;
  }
  if (width > BAR_MAX_PAGE_RATIO * pageWidth || height > BAR_MAX_PAGE_RATIO * pageHeight) {
    return false;
  }
  return width >= height * BAR_ASPECT_RATIO || height >= width * BAR_ASPECT_RATIO;
}

/** True when two bars share a start edge and sit next to each other, like rows of skill bars. */
function isStacked(bars: ReadonlyArray<{ start: number; center: number }>): boolean {
  const sorted = [...bars].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j].start - sorted[i].start <= BAR_ALIGN_TOLERANCE) j++;
    const centers = sorted
      .slice(i, j)
      .map((bar) => bar.center)
      .sort((a, b) => a - b);
    for (let k = 1; k < centers.length; k++) {
      const gap = centers[k] - centers[k - 1];
      if (gap > BAR_SLOT_TOLERANCE && gap <= BAR_STACK_MAX_GAP) {
        return true;
      }
    }
    i = j;
  }
  return false;
}

/** Skill bars and charts come as a stack of aligned bars; a lone bar-shaped fill is an accent. */
function hasBarStack(bars: readonly PdfBox[]): boolean {
  const horizontal = bars.filter((box) => box.x1 - box.x0 > box.y1 - box.y0);
  const vertical = bars.filter((box) => box.x1 - box.x0 < box.y1 - box.y0);
  return (
    isStacked(horizontal.map((box) => ({ start: box.x0, center: (box.y0 + box.y1) / 2 }))) ||
    isStacked(vertical.map((box) => ({ start: box.y0, center: (box.x0 + box.x1) / 2 })))
  );
}

/** Graphics that ATS cannot read (BR-05): skill bars and charts, images, and gradient areas. */
export function classifyGraphics(shapes: readonly PaintedShape[], pageBox: PdfBox): GraphicKind[] {
  const pageWidth = pageBox.x1 - pageBox.x0;
  const pageHeight = pageBox.y1 - pageBox.y0;
  const kinds = new Set<GraphicKind>();
  const bars: PdfBox[] = [];
  for (const shape of shapes) {
    if (isBarShaped(shape.box, pageWidth, pageHeight)) {
      bars.push(shape.box);
    }
    const thinnerSide = Math.min(shape.box.x1 - shape.box.x0, shape.box.y1 - shape.box.y0);
    if (shape.kind !== "fill" && thinnerSide >= GRAPHIC_MIN_SIDE) {
      kinds.add(shape.kind);
    }
  }
  if (hasBarStack(bars)) {
    kinds.add("bar");
  }
  return [...kinds];
}

/**
 * Replays a page's operator list with the text and graphics state PDF defines, producing text runs
 * in page space, every painted shape with its paint order (for background checks), and graphic kinds.
 */
export function walkOperatorList(
  opList: OperatorListLike,
  ops: Record<string, number>,
  resolveFont: FontResolver,
  pageBox: PdfBox,
): WalkResult {
  const names = opNames(ops);
  const fillOps = new Set(FILL_OPS.map((name) => ops[name]).filter((id) => typeof id === "number"));

  const runs: WalkedRun[] = [];
  const shapes: PaintedShape[] = [];
  const stack: GraphicsState[] = [];
  let gs: GraphicsState = {
    ctm: IDENTITY,
    fillColor: "#000000",
    strokeColor: "#000000",
    fillAlpha: 1,
    strokeAlpha: 1,
    font: null,
    fontSize: 0,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
    rise: 0,
    renderMode: 0,
    clip: null,
  };
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let order = 0;
  let pendingClip = false;

  const moveText = (tx: number, ty: number) => {
    tlm = multiply([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };

  const showText = (glyphs: unknown) => {
    if (!Array.isArray(glyphs)) {
      return;
    }
    const font = gs.font ?? UNKNOWN_FONT;
    const size = gs.fontSize;
    const em = Math.abs(size);
    const base = multiply(tm, gs.ctm);
    const fontSize = em * Math.hypot(base[2], base[3]);
    const stroked = gs.renderMode === 1 || gs.renderMode === 5;
    const color = stroked ? gs.strokeColor : gs.fillColor;
    const alpha = stroked ? gs.strokeAlpha : gs.fillAlpha;

    let advance = 0;
    let segmentStart = 0;
    let text = "";
    const flush = () => {
      if (text.length > 0) {
        const [x, y] = applyToPoint(base, segmentStart, gs.rise);
        const [endX, endY] = applyToPoint(base, advance, gs.rise);
        runs.push({
          text,
          x,
          y,
          width: Math.hypot(endX - x, endY - y),
          fontSize,
          font,
          color,
          alpha,
          renderMode: gs.renderMode,
          order: order++,
        });
      }
      text = "";
    };

    for (const glyph of glyphs) {
      if (typeof glyph === "number") {
        const shift = (-glyph / 1000) * size * gs.hScale;
        if (em > 0 && shift >= RUN_SPLIT_GAP_EM * em) {
          flush();
          advance += shift;
          segmentStart = advance;
          continue;
        }
        if (em > 0 && shift >= SPACE_GAP_EM * em && text.length > 0 && !text.endsWith(" ")) {
          text += " ";
        }
        advance += shift;
        continue;
      }
      if (glyph === null || typeof glyph !== "object") {
        continue;
      }
      const { unicode, width, isSpace } = glyph as { unicode?: unknown; width?: unknown; isSpace?: unknown };
      if (text.length === 0) {
        segmentStart = advance;
      }
      text += typeof unicode === "string" ? unicode : "";
      advance +=
        (num(width) * font.fontMatrixScale * size + gs.charSpacing + (isSpace === true ? gs.wordSpacing : 0)) *
        gs.hScale;
    }
    flush();
    tm = multiply([1, 0, 0, 1, advance, 0], tm);
  };

  for (let i = 0; i < opList.fnArray.length; i++) {
    const name = names.get(opList.fnArray[i]);
    const rawArgs = opList.argsArray[i];
    const args: readonly unknown[] = Array.isArray(rawArgs) ? rawArgs : [];

    switch (name) {
      case "save":
      case "beginGroup":
        stack.push({ ...gs });
        break;
      case "restore":
      case "endGroup":
      case "paintFormXObjectEnd":
        gs = stack.pop() ?? gs;
        break;
      case "transform": {
        const m = toMatrix(args);
        if (m) {
          gs.ctm = multiply(m, gs.ctm);
        }
        break;
      }
      case "paintFormXObjectBegin": {
        stack.push({ ...gs });
        const m = toMatrix(args[0]);
        if (m) {
          gs.ctm = multiply(m, gs.ctm);
        }
        const bbox = toNumbers(args[1], 4);
        if (bbox) {
          gs.clip = intersectBoxes(gs.clip, transformBox(bbox[0], bbox[1], bbox[2], bbox[3], gs.ctm));
        }
        break;
      }
      case "setGState":
        if (Array.isArray(args[0])) {
          for (const pair of args[0]) {
            if (!Array.isArray(pair)) continue;
            if (pair[0] === "ca") gs.fillAlpha = num(pair[1], gs.fillAlpha);
            if (pair[0] === "CA") gs.strokeAlpha = num(pair[1], gs.strokeAlpha);
          }
        }
        break;
      case "setFillRGBColor":
        gs.fillColor = toHexColor(args[0]);
        break;
      case "setStrokeRGBColor":
        gs.strokeColor = toHexColor(args[0]);
        break;
      case "setFillColorN":
      case "setFillTransparent":
        gs.fillColor = null;
        break;
      case "setStrokeColorN":
      case "setStrokeTransparent":
        gs.strokeColor = null;
        break;
      case "beginText":
        tm = IDENTITY;
        tlm = IDENTITY;
        break;
      case "setTextMatrix": {
        const m = toMatrix(args[0]);
        if (m) {
          tm = m;
          tlm = m;
        }
        break;
      }
      case "moveText":
        moveText(num(args[0]), num(args[1]));
        break;
      case "setLeadingMoveText":
        gs.leading = -num(args[1]);
        moveText(num(args[0]), num(args[1]));
        break;
      case "nextLine":
        moveText(0, -gs.leading);
        break;
      case "setLeading":
        gs.leading = num(args[0]);
        break;
      case "setCharSpacing":
        gs.charSpacing = num(args[0]);
        break;
      case "setWordSpacing":
        gs.wordSpacing = num(args[0]);
        break;
      case "setHScale":
        gs.hScale = num(args[0], 100) / 100;
        break;
      case "setTextRise":
        gs.rise = num(args[0]);
        break;
      case "setTextRenderingMode":
        gs.renderMode = num(args[0]);
        break;
      case "setFont":
        gs.font = typeof args[0] === "string" ? (resolveFont(args[0]) ?? UNKNOWN_FONT) : UNKNOWN_FONT;
        gs.fontSize = num(args[1]);
        break;
      case "showText":
        showText(args[0]);
        break;
      case "clip":
      case "eoClip":
        // pdf.js emits the clip marker before the path it applies to.
        pendingClip = true;
        break;
      case "constructPath": {
        const bbox = toNumbers(args[2], 4);
        if (!bbox) {
          pendingClip = false;
          break;
        }
        const box = transformBox(bbox[0], bbox[1], bbox[2], bbox[3], gs.ctm);
        if (pendingClip) {
          gs.clip = intersectBoxes(gs.clip, box);
          pendingClip = false;
        }
        if (typeof args[0] === "number" && fillOps.has(args[0])) {
          shapes.push({ box, kind: "fill", color: gs.fillColor, alpha: gs.fillAlpha, order: order++ });
        }
        break;
      }
      case "shadingFill":
        shapes.push({ box: gs.clip ?? pageBox, kind: "shading", color: null, alpha: gs.fillAlpha, order: order++ });
        break;
      default:
        if (name !== undefined && IMAGE_OPS.has(name)) {
          const box = transformBox(0, 0, 1, 1, gs.ctm);
          shapes.push({ box, kind: "image", color: null, alpha: gs.fillAlpha, order: order++ });
        }
    }
  }

  return { runs, shapes, graphics: classifyGraphics(shapes, pageBox) };
}
