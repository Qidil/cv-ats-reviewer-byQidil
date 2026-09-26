import { classifyRunVisibility, cleanRunText, isOcrLayerPage, summarizeHiddenText } from "@/lib/ats/white-text";
import { assembleText, buildLayout, buildTypography, parseFontName, type LayoutRun } from "./layout";
import { loadPdfjs, toPdfExtractionError, type PdfPage } from "./pdfjs";
import {
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MIN_VISIBLE_CHARS,
  PdfExtractionError,
  nonSpaceLength,
  type GraphicKind,
  type HiddenReason,
  type PdfBox,
  type PdfExtraction,
  type PdfPageInfo,
  type PdfRun,
} from "./types";
import { walkOperatorList, type FontInfo, type WalkedRun } from "./walker";

const PDF_HEADER = "%PDF-";
const HEADER_SEARCH_BYTES = 1024;
/** Below this share of pdf.js text content the operator walk is assumed to have failed. */
const FALLBACK_TEXT_RATIO = 0.5;
/**
 * pdf.js decodes every image in-process while building the operator list. Larger images are
 * dropped before decoding, which bounds memory per image; a 400 dpi A4 scan still fits.
 */
const MAX_IMAGE_PIXELS = 25_000_000;
/**
 * The background search costs runs × shapes per page, so crafted pages are rejected. A dense
 * one-page CV has about 5,000 glyphs and a few hundred shapes.
 */
const MAX_RUNS_PER_PAGE = 20_000;
const MAX_SHAPES_PER_PAGE = 5_000;
/** The PDF specification's page size limit, 200 inches. */
const MAX_PAGE_SIDE = 14_400;

function hasPdfHeader(data: Uint8Array): boolean {
  const head = String.fromCharCode(...data.subarray(0, HEADER_SEARCH_BYTES));
  return head.includes(PDF_HEADER);
}

function normalizeBox(view: readonly number[]): PdfBox {
  const [a = 0, b = 0, c = 0, d = 0] = view;
  return { x0: Math.min(a, c), y0: Math.min(b, d), x1: Math.max(a, c), y1: Math.max(b, d) };
}

/**
 * Compares the walker's total text (hidden runs included) with pdf.js text content. Counting hidden
 * text keeps a PDF full of invisible text from forcing the fallback, which cannot screen it.
 */
export function chooseTextSource(
  walkerChars: number,
  textContentChars: number,
): "operator-list" | "text-content" {
  return textContentChars >= MIN_VISIBLE_CHARS && walkerChars < textContentChars * FALLBACK_TEXT_RATIO
    ? "text-content"
    : "operator-list";
}

function fontResolver(page: PdfPage): (fontId: string) => FontInfo | null {
  const cache = new Map<string, FontInfo | null>();
  return (fontId) => {
    if (cache.has(fontId)) {
      return cache.get(fontId) ?? null;
    }
    let info: FontInfo | null = null;
    if (page.commonObjs.has(fontId)) {
      const font = page.commonObjs.get(fontId) as {
        name?: unknown;
        bold?: unknown;
        italic?: unknown;
        fontMatrix?: ArrayLike<unknown>;
      };
      const parsed = parseFontName(typeof font.name === "string" ? font.name : "");
      const scale = font.fontMatrix?.[0];
      info = {
        family: parsed.family,
        bold: font.bold === true || parsed.bold,
        italic: font.italic === true || parsed.italic,
        fontMatrixScale: typeof scale === "number" && scale !== 0 ? scale : 0.001,
      };
    }
    cache.set(fontId, info);
    return info;
  };
}

interface ClassifiedRun extends LayoutRun {
  color: string | null;
  hiddenReasons: HiddenReason[];
}

interface TextContentRun {
  text: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

function toClassifiedRun(run: WalkedRun, text: string, pageNumber: number, reasons: HiddenReason[]): ClassifiedRun {
  return {
    text,
    pageNumber,
    x: run.x,
    y: run.y,
    width: run.width,
    fontSize: run.fontSize,
    fontFamily: run.font.family,
    bold: run.font.bold,
    italic: run.font.italic,
    color: run.color,
    hidden: reasons.length > 0,
    hiddenReasons: reasons,
  };
}

function fromTextContent(run: TextContentRun): ClassifiedRun {
  return {
    ...run,
    fontFamily: "Unknown",
    bold: false,
    italic: false,
    color: null,
    hidden: false,
    hiddenReasons: [],
  };
}

/**
 * Server only (ADR-007). Extracts text, run boxes, and typography/layout metadata from an uploaded
 * CV, and separates hidden text (BR-02). The input buffer is copied, never stored.
 */
export async function extractPdf(data: Uint8Array): Promise<PdfExtraction> {
  if (data.byteLength > MAX_PDF_BYTES) {
    throw new PdfExtractionError("PDF_TOO_LARGE");
  }
  if (!hasPdfHeader(data)) {
    throw new PdfExtractionError("PDF_INVALID");
  }

  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    data: data.slice(),
    maxImageSize: MAX_IMAGE_PIXELS,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });

  try {
    const doc = await loadingTask.promise;
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new PdfExtractionError("PDF_TOO_MANY_PAGES");
    }

    const pages: PdfPageInfo[] = [];
    const walkedRuns: ClassifiedRun[] = [];
    const textContentRuns: TextContentRun[] = [];
    const graphics = new Set<GraphicKind>();

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const box = normalizeBox(page.view);
      if (box.x1 - box.x0 > MAX_PAGE_SIDE || box.y1 - box.y0 > MAX_PAGE_SIDE) {
        throw new PdfExtractionError("PDF_INVALID");
      }
      const opList = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
      const walk = walkOperatorList(opList, pdfjs.OPS, fontResolver(page), box);
      if (walk.runs.length > MAX_RUNS_PER_PAGE || walk.shapes.length > MAX_SHAPES_PER_PAGE) {
        throw new PdfExtractionError("PDF_INVALID");
      }
      walk.graphics.forEach((kind) => graphics.add(kind));

      const classified = walk.runs
        .map((run) => ({ run, text: cleanRunText(run.text), reasons: classifyRunVisibility(run, walk.shapes, box) }))
        .filter(({ text }) => text !== "");
      const ocrLayer = isOcrLayerPage(
        classified.map(({ text, reasons }) => ({ text, reasons })),
        walk.shapes,
        box,
      );
      for (const { run, text, reasons } of classified) {
        const kept = ocrLayer ? reasons.filter((reason) => reason !== "invisible-mode") : reasons;
        walkedRuns.push(toClassifiedRun(run, text, pageNumber, kept));
      }
      pages.push({ pageNumber, box, ocrLayer });

      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const text = cleanRunText(item.str);
        if (text === "") continue;
        const [, , c = 0, d = 0, x = 0, y = 0] = item.transform as number[];
        textContentRuns.push({
          text,
          pageNumber,
          x,
          y,
          width: item.width,
          fontSize: Math.hypot(c, d) || item.height,
        });
      }
    }

    const walkedText = assembleText(walkedRuns);
    const source = chooseTextSource(
      nonSpaceLength(walkedText.rawText),
      textContentRuns.reduce((sum, run) => sum + nonSpaceLength(run.text), 0),
    );
    const runs = source === "operator-list" ? walkedRuns : textContentRuns.map(fromTextContent);
    const assembled = source === "operator-list" ? walkedText : assembleText(runs);

    if (nonSpaceLength(assembled.visibleText) < MIN_VISIBLE_CHARS) {
      throw new PdfExtractionError("PDF_NO_TEXT_FOUND");
    }

    const visibleRuns = runs.filter((run) => !run.hidden);
    const pageBoxes = new Map(pages.map((page) => [page.pageNumber, page.box]));
    const ocrPages = pages.filter((page) => page.ocrLayer).map((page) => page.pageNumber);
    const pdfRuns: PdfRun[] = runs.map((run, index) => ({
      ...run,
      textStart: assembled.offsets[index][0],
      textEnd: assembled.offsets[index][1],
    }));

    return {
      source,
      pageCount: doc.numPages,
      pages,
      runs: pdfRuns,
      rawText: assembled.rawText,
      sanitizedText: assembled.sanitizedText,
      visibleText: assembled.visibleText,
      metadata: {
        typography: source === "operator-list" ? buildTypography(visibleRuns, pageBoxes) : null,
        layout: source === "operator-list" ? buildLayout(visibleRuns, graphics, ocrPages) : null,
        hiddenText: summarizeHiddenText(runs, source === "operator-list"),
      },
    };
  } catch (error) {
    throw toPdfExtractionError(error);
  } finally {
    await loadingTask.destroy();
  }
}
