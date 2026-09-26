import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { loadPdfjs } from "./pdfjs";
import { MAX_IMAGE_PIXELS } from "./types";

/**
 * pdf.js reads the files for fonts a PDF does not embed from here; without them such text renders
 * with wrong glyphs. The base must end with "/", and the files are traced into the deployment.
 */
export const STANDARD_FONT_DATA_URL = `${path
  .join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts")
  .split(path.sep)
  .join("/")}/`;

/** rules.md §3.4: tried in order until every page fits the budget together. */
export const RENDER_LADDER: ReadonlyArray<{ width: number; quality: number }> = [
  { width: 1240, quality: 80 },
  { width: 1000, quality: 70 },
  { width: 800, quality: 60 },
];
/** A very tall page would otherwise become a huge canvas at the ladder width. */
const MAX_CANVAS_PIXELS = 4_000_000;

export interface PagePreview {
  pageNumber: number;
  width: number;
  height: number;
  webp: Uint8Array;
}

export interface RenderOptions {
  /** Total size of all images once base64-encoded, the form they travel in. */
  budgetBytes: number;
  deadlineMs: number;
  signal?: AbortSignal;
  now?: () => number;
}

export const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;

// pdf.js work runs in this thread; yielding between pages lets pending network I/O (the AI request) proceed.
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

type PdfjsDocument = Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>["getDocument"]>["promise"]>;

async function renderPage(doc: PdfjsDocument, pageNumber: number, width: number, quality: number): Promise<PagePreview> {
  const page = await doc.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(width / base.width, Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height)));
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    // pdf.js is typed against the DOM canvas; @napi-rs/canvas implements the same 2D API.
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
      viewport,
      background: "#ffffff",
    }).promise;
    const webp = await canvas.encode("webp", quality);
    return { pageNumber, width: canvas.width, height: canvas.height, webp: new Uint8Array(webp) };
  } finally {
    page.cleanup();
  }
}

/**
 * ADR-004: WebP images of every page for the preview. Never throws: a page that fails, a page past
 * the deadline, or a page over the budget is simply missing from the result.
 */
export async function renderPagePreviews(data: Uint8Array, options: RenderOptions): Promise<PagePreview[]> {
  const now = options.now ?? Date.now;
  const deadline = now() + options.deadlineMs;
  const stopped = () => options.signal?.aborted === true || now() >= deadline;
  if (stopped()) {
    return [];
  }

  let loadingTask: ReturnType<Awaited<ReturnType<typeof loadPdfjs>>["getDocument"]> | undefined;
  try {
    const pdfjs = await loadPdfjs();
    loadingTask = pdfjs.getDocument({
      data: data.slice(),
      maxImageSize: MAX_IMAGE_PIXELS,
      disableFontFace: true,
      useSystemFonts: false,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    });
    const doc = await loadingTask.promise;

    let best: PagePreview[] = [];
    for (const step of RENDER_LADDER) {
      const rendered: PagePreview[] = [];
      let total = 0;
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        await yieldToEventLoop();
        if (stopped()) {
          return best.length > rendered.length ? best : rendered;
        }
        try {
          const preview = await renderPage(doc, pageNumber, step.width, step.quality);
          total += base64Length(preview.webp.byteLength);
          if (total > options.budgetBytes) {
            break;
          }
          rendered.push(preview);
        } catch {
          // One broken page must not cost the other pages their images.
        }
      }
      if (total <= options.budgetBytes) {
        return rendered;
      }
      if (rendered.length > best.length) {
        best = rendered;
      }
    }
    return best;
  } catch {
    return [];
  } finally {
    await loadingTask?.destroy().catch(() => undefined);
  }
}
