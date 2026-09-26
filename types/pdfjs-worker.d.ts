/** pdfjs-dist ships no types for its worker entry; it is imported only for its side effect. */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
