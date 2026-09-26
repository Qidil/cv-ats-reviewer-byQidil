import { PdfExtractionError } from "./types";

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocument = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;
export type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

let pdfjsPromise: Promise<PdfjsModule> | undefined;

/**
 * Server only. The worker module registers itself on globalThis, so pdf.js runs it in this process
 * without resolving a file at runtime, and serverless file tracing keeps it in the deployment.
 */
export function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ]).then(
    ([pdfjs]) => pdfjs,
    (error: unknown) => {
      pdfjsPromise = undefined;
      throw error;
    },
  );
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
