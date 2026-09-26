import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PdfExtractionError } from "./types";

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocument = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;
export type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

let pdfjsPromise: Promise<PdfjsModule> | undefined;

/**
 * Server only. The worker is resolved from node_modules, so pdfjs-dist has to stay out of the
 * Next.js server bundle (serverExternalPackages, added with the first route in Phase 3).
 */
export function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    const nodeRequire = createRequire(import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      nodeRequire.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ).href;
    return pdfjs;
  });
  return pdfjsPromise;
}

/** pdf.js rebuilds worker errors on the main side, so the name is more reliable than instanceof. */
export function toPdfExtractionError(error: unknown): PdfExtractionError {
  if (error instanceof PdfExtractionError) {
    return error;
  }
  const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined;
  if (name === "PasswordException") {
    return new PdfExtractionError("PDF_PASSWORD_PROTECTED", { cause: error });
  }
  return new PdfExtractionError("PDF_INVALID", { cause: error });
}
