import type { Language } from "@/lib/i18n/language";

/** BR-01. 4 MB (P3-D1), so a whole upload request fits Vercel's 4.5 MB body limit. */
export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;
/** Below this many visible non-space characters the PDF is treated as a scan or photo. */
export const MIN_VISIBLE_CHARS = 50;
/**
 * pdf.js decodes every image in-process, for extraction and for rendering. Larger images are
 * dropped before decoding, which bounds memory per image; a 400 dpi A4 scan still fits.
 */
export const MAX_IMAGE_PIXELS = 25_000_000;

export function nonSpaceLength(text: string): number {
  return text.replace(/\s/g, "").length;
}

export const PDF_ERROR_CODES = [
  "PDF_TOO_LARGE",
  "PDF_INVALID",
  "PDF_PASSWORD_PROTECTED",
  "PDF_TOO_MANY_PAGES",
  "PDF_NO_TEXT_FOUND",
  "PDF_TOO_COMPLEX",
] as const;

export type PdfErrorCode = (typeof PDF_ERROR_CODES)[number];

/** Catalog messages for the PDF codes in both interface languages (api.md, BR-13). */
export const PDF_ERROR_MESSAGES: Readonly<Record<PdfErrorCode, Readonly<Record<Language, string>>>> = {
  PDF_TOO_LARGE: {
    en: "The file is larger than 4 MB. Compress the PDF or export it again with lower-resolution images.",
    id: "Ukuran file lebih dari 4 MB. Kompres PDF-nya atau ekspor ulang dengan gambar beresolusi lebih rendah.",
  },
  PDF_INVALID: {
    en: "This file is not a PDF that can be opened. Export your CV to PDF again from Word, Google Docs, or a similar app.",
    id: "File ini bukan PDF yang bisa dibuka. Ekspor ulang CV dari Word, Google Docs, atau aplikasi sejenis ke PDF.",
  },
  PDF_PASSWORD_PROTECTED: {
    en: "This PDF is password-protected. Remove the password, then upload it again.",
    id: "PDF ini dikunci kata sandi. Buka kuncinya dulu, lalu unggah lagi.",
  },
  PDF_TOO_MANY_PAGES: {
    en: "This PDF has more than 10 pages. Upload just the CV, usually 1 to 2 pages.",
    id: "PDF ini berisi lebih dari 10 halaman. Unggah CV saja, umumnya 1 sampai 2 halaman.",
  },
  PDF_NO_TEXT_FOUND: {
    en: "The text in this PDF cannot be read, usually because the CV is a scan or a photo. Export your CV to PDF again from Word, Google Docs, or a similar app.",
    id: "Teks di PDF ini tidak terbaca, biasanya karena CV berupa hasil scan atau foto. Ekspor ulang CV dari Word, Google Docs, atau aplikasi sejenis ke PDF.",
  },
  PDF_TOO_COMPLEX: {
    en: "This PDF is too complex to process. Export your CV to PDF again from Word, Google Docs, or a similar app.",
    id: "PDF ini terlalu rumit untuk diproses. Ekspor ulang CV dari Word, Google Docs, atau aplikasi sejenis ke PDF.",
  },
};

export class PdfExtractionError extends Error {
  readonly code: PdfErrorCode;

  constructor(code: PdfErrorCode, options?: { cause?: unknown }) {
    super(PDF_ERROR_MESSAGES[code].en, options);
    this.name = "PdfExtractionError";
    this.code = code;
  }
}

/** Rectangle in PDF points, page space (origin at the bottom-left). */
export interface PdfBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type HiddenReason = "low-contrast" | "invisible-mode" | "transparent" | "tiny-font" | "off-page";

export interface PdfRun {
  text: string;
  pageNumber: number;
  /** Baseline start, page space. */
  x: number;
  y: number;
  width: number;
  /** Font size after the text matrix and CTM are applied. */
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  /** #rrggbb, or null when the paint comes from a pattern. */
  color: string | null;
  hidden: boolean;
  hiddenReasons: HiddenReason[];
  /** rawText.slice(textStart, textEnd) === text, which maps an AI snippet back to its boxes. */
  textStart: number;
  textEnd: number;
}

export interface PdfPageInfo {
  pageNumber: number;
  box: PdfBox;
  /** Scanned page whose invisible OCR text was kept as readable text (BR-02). */
  ocrLayer: boolean;
}

export interface FontUsage {
  family: string;
  bold: boolean;
  italic: boolean;
  size: number;
  charCount: number;
}

export interface TypographyMetadata {
  fonts: FontUsage[];
  fontFamilies: string[];
  fontSizes: number[];
  bodySize: number | null;
  titleSize: number | null;
  lineSpacing: number | null;
  margins: { left: number; right: number; top: number; bottom: number } | null;
  boldRatio: number | null;
  italicRatio: number | null;
}

export type GraphicKind = "bar" | "image" | "shading";

export interface LayoutMetadata {
  columnCount: number;
  hasGraphics: boolean;
  graphics: GraphicKind[];
  ocrPages: number[];
}

export interface HiddenTextSample {
  text: string;
  pageNumber: number;
}

export interface HiddenTextSummary {
  /** False after the text-content fallback, which cannot see colors or render modes. */
  checked: boolean;
  runCount: number;
  /** Non-whitespace characters inside hidden runs. */
  charCount: number;
  /** Hidden text contains a letter or digit, which triggers the delete notice (BR-02). */
  hasWords: boolean;
  reasons: HiddenReason[];
  samples: HiddenTextSample[];
}

export interface PdfMetadata {
  typography: TypographyMetadata | null;
  layout: LayoutMetadata | null;
  hiddenText: HiddenTextSummary;
}

export interface PdfExtraction {
  source: "operator-list" | "text-content";
  pageCount: number;
  pages: PdfPageInfo[];
  runs: PdfRun[];
  /** Every run, hidden ones included. */
  rawText: string;
  /** Hidden runs in merged [IGNORED]...[/IGNORED] blocks; brackets from the PDF become parentheses so no run forges a marker. Never sent to the AI. */
  sanitizedText: string;
  /** Hidden runs removed. The only text the AI may receive (BR-02). */
  visibleText: string;
  metadata: PdfMetadata;
}
