import { describe, expect, it } from "vitest";
import { chooseTextSource, extractPdf } from "./extractor";
import { toPdfExtractionError } from "./pdfjs";
import {
  FILLER_LINE,
  GREY_IMAGE_XOBJECT,
  INLINE_GREY_IMAGE,
  makePdf,
  pdfStream,
  textLine,
  type TestPdfOptions,
} from "./test-utils/make-pdf";
import {
  MAX_PDF_BYTES,
  PdfExtractionError,
  type PdfBox,
  type PdfErrorCode,
  type PdfExtraction,
  type PdfRun,
} from "./types";
import { classifyGraphics, type PaintedShape } from "./walker";

function extract(pages: string | string[], options?: TestPdfOptions): Promise<PdfExtraction> {
  return extractPdf(makePdf(Array.isArray(pages) ? pages : [pages], options));
}

/** Helvetica advance widths (1/1000 em) for the characters the right-aligned cases use. */
const HELVETICA_WIDTHS: Readonly<Record<string, number>> = {
  " ": 278, "-": 333, "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
  "8": 556, "9": 556, B: 667, J: 500, M: 833, S: 667, a: 556, b: 556, d: 556, e: 556, g: 556, k: 500,
  n: 556, r: 333, t: 278, u: 556, y: 500,
};

function rightAligned(text: string, right: number, y: number, size = 11): string {
  const width = ([...text].reduce((sum, char) => sum + (HELVETICA_WIDTHS[char] ?? 556), 0) * size) / 1000;
  return textLine(text, right - width, y, size);
}

function runContaining(result: PdfExtraction, text: string): PdfRun {
  const run = result.runs.find((candidate) => candidate.text.includes(text));
  if (!run) {
    throw new Error(`No run contains "${text}"`);
  }
  return run;
}

async function expectPdfError(promise: Promise<unknown>, code: PdfErrorCode): Promise<void> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(PdfExtractionError);
  expect((error as PdfExtractionError).code).toBe(code);
}

describe("extractPdf text and positions", () => {
  it("returns runs with page-space position, size, width, and raw-text offsets", async () => {
    const result = await extract([textLine("Hello World", 72, 720, 12), FILLER_LINE].join("\n"));
    const run = runContaining(result, "Hello World");

    expect(result.source).toBe("operator-list");
    expect(result.pageCount).toBe(1);
    expect(run.x).toBeCloseTo(72, 1);
    expect(run.y).toBeCloseTo(720, 1);
    expect(run.fontSize).toBeCloseTo(12, 5);
    // Helvetica advance widths for "Hello World" add up to 5.167 em.
    expect(run.width).toBeCloseTo(62, 1);
    for (const each of result.runs) {
      expect(result.rawText.slice(each.textStart, each.textEnd)).toBe(each.text);
    }
  });

  it("turns TJ kerning gaps into word spaces", async () => {
    const result = await extract(["BT /F1 12 Tf 72 720 Td [(Senior) -300 (Engineer)] TJ ET", FILLER_LINE].join("\n"));

    expect(result.rawText).toContain("Senior Engineer");
    expect(runContaining(result, "Senior").text).toBe("Senior Engineer");
  });

  it("starts a new run at a tab-like jump inside one TJ", async () => {
    const result = await extract(["BT /F1 12 Tf 72 720 Td [(Engineer) -12000 (2020)] TJ ET", FILLER_LINE].join("\n"));

    expect(runContaining(result, "Engineer").text).toBe("Engineer");
    // 72 + 4.002 em ("Engineer") * 12 + 12 em * 12
    expect(runContaining(result, "2020").x).toBeCloseTo(264.02, 1);
    expect(result.rawText).toContain("Engineer 2020");
  });

  it("applies the text matrix and the CTM to size and position", async () => {
    const result = await extract(
      [
        "BT /F1 1 Tf 12 0 0 12 72 700 Tm (Scaled by the text matrix) Tj ET",
        "q 2 0 0 2 0 0 cm BT /F1 6 Tf 36 300 Td (Doubled by the CTM) Tj ET Q",
        FILLER_LINE,
      ].join("\n"),
    );
    const scaled = runContaining(result, "Scaled");
    const doubled = runContaining(result, "Doubled");

    expect(scaled.fontSize).toBeCloseTo(12, 5);
    expect(scaled.hidden).toBe(false);
    expect(doubled.x).toBeCloseTo(72, 5);
    expect(doubled.y).toBeCloseTo(600, 5);
    expect(doubled.fontSize).toBeCloseTo(12, 5);
  });

  it("reads text inside a form XObject with the form matrix", async () => {
    const form = pdfStream(
      "/Type /XObject /Subtype /Form /BBox [0 0 300 100] /Matrix [2 0 0 2 0 0] /Resources << /Font << /F1 3 0 R >> >>",
      "BT /F1 6 Tf 10 10 Td (Inside form) Tj ET",
    );
    const result = await extract(["q 1 0 0 1 100 200 cm /Fm0 Do Q", FILLER_LINE].join("\n"), {
      xObjects: { Fm0: form },
    });
    const run = runContaining(result, "Inside form");

    expect(run.x).toBeCloseTo(120, 5);
    expect(run.y).toBeCloseTo(220, 5);
    expect(run.fontSize).toBeCloseTo(12, 5);
  });

  it("joins pages in order and tags runs with their page", async () => {
    const result = await extract([
      [textLine("Halaman satu", 72, 720), FILLER_LINE].join("\n"),
      textLine("Halaman dua", 72, 720),
    ]);

    expect(result.pageCount).toBe(2);
    expect(result.rawText.indexOf("Halaman satu")).toBeLessThan(result.rawText.indexOf("Halaman dua"));
    expect(runContaining(result, "Halaman dua").pageNumber).toBe(2);
    for (const run of result.runs) {
      expect(result.rawText.slice(run.textStart, run.textEnd)).toBe(run.text);
    }
  });
});

describe("extractPdf layout metadata", () => {
  it("detects a two-column layout", async () => {
    const result = await extract(
      [
        textLine("Left col line one", 72, 740, 12),
        textLine("Left col line two", 72, 720, 12),
        textLine("Left col line three", 72, 700, 12),
        textLine("Right col line one", 340, 740, 12),
        textLine("Right col line two", 340, 720, 12),
        textLine("Right col line three", 340, 700, 12),
      ].join("\n"),
    );

    expect(result.metadata.layout?.columnCount).toBe(2);
  });

  it("does not treat a right-aligned header contact as a second column", async () => {
    const result = await extract(
      [
        textLine("Budi Sudirman", 72, 740, 16),
        textLine("budi@mail.com", 340, 744, 9),
        textLine("+62 812 3456 7890", 340, 728, 9),
        textLine("Pengalaman", 72, 700),
        textLine("bekerja di perusahaan X", 72, 680),
        textLine("Pendidikan", 72, 660),
        textLine("S1 Teknik Informatika", 72, 640),
      ].join("\n"),
    );

    expect(result.metadata.layout?.columnCount).toBe(1);
  });

  it("does not treat right-aligned dates on job title lines as a second column", async () => {
    const lines = Array.from({ length: 12 }, (_, index) =>
      textLine(`Bullet pengalaman kerja nomor ${index + 1}`, 72, 740 - index * 20),
    );
    const dates = [740, 640, 540].map((y) => textLine("2020 - 2023", 460, y));
    const result = await extract([...lines, ...dates].join("\n"));

    expect(result.metadata.layout?.columnCount).toBe(1);
  });

  const bodyLines = () =>
    Array.from({ length: 12 }, (_, index) => textLine(`Bullet pengalaman kerja nomor ${index + 1}`, 72, 740 - index * 20));

  it("does not treat right-aligned places of different widths as a column", async () => {
    const places = ["Jakarta", "Bandung", "Surabaya", "Medan", "Jakarta"].map((place, index) =>
      rightAligned(place, 540, 740 - [0, 3, 6, 9, 11][index] * 20),
    );
    const result = await extract([...bodyLines(), ...places].join("\n"));

    expect(result.metadata.layout?.columnCount).toBe(1);
  });

  it("does not treat dense right-aligned dates as a column", async () => {
    const dates = [0, 2, 4, 6, 8, 10].map((index) => rightAligned("2019 - 2021", 540, 740 - index * 20));
    const result = await extract([...bodyLines(), ...dates].join("\n"));

    expect(result.metadata.layout?.columnCount).toBe(1);
  });

  it("counts only the clusters that pass as columns", async () => {
    const left = Array.from({ length: 12 }, (_, index) => textLine(`Kolom kiri baris ${index + 1}`, 72, 740 - index * 20));
    const right = Array.from({ length: 12 }, (_, index) => textLine(`Kolom kanan baris ${index + 1}`, 340, 740 - index * 20));
    const grid = [460, 445].flatMap((y) => [textLine("Python", 72, y), textLine("Docker", 250, y), textLine("Figma", 430, y)]);
    const result = await extract([...left, ...right, ...grid].join("\n"));

    expect(result.metadata.layout?.columnCount).toBe(2);
  });

  it("measures line spacing from wrapped lines, so paragraph and section gaps do not count", async () => {
    // Gaps of 13.2 pt at 11 pt (1.2) inside paragraphs, 17.6 pt (1.6) between single-line bullets, one 30 pt section gap.
    const ys = [740, 726.8, 713.6, 700.4, 682.8, 665.2, 647.6, 617.6, 604.4];
    const result = await extract(ys.map((y, index) => textLine(`Baris isi nomor ${index + 1}`, 72, y)).join("\n"));

    expect(result.metadata.typography?.lineSpacing).toBe(1.2);
  });

  const SKILL_BARS = [0, 1, 2]
    .map((i) => `q 0.85 0.85 0.85 rg 300 ${600 - i * 20} 150 6 re f 0.2 0.4 0.8 rg 300 ${600 - i * 20} ${60 + i * 30} 6 re f Q`)
    .join("\n");
  const BAR_CHART = [0, 1, 2, 3].map((i) => `q ${300 + i * 20} 400 10 ${40 + i * 15} re f Q`).join("\n");
  const HEADING_ACCENTS = [0, 1, 2, 3, 4].map((i) => `q 72 ${690 - i * 140} 60 4 re f Q`).join("\n");

  it.each([
    ["three skill bars with tracks", SKILL_BARS, ["bar"]],
    ["a vertical bar chart", BAR_CHART, ["bar"]],
    ["a single bar-shaped accent", "q 1 0 0 1 72 600 cm 0 0 300 6 re f Q", []],
    ["a 2 pt divider under a heading", `${textLine("SUMMARY", 72, 704, 12)} q 72 698 300 2 re f Q`, []],
    ["a 3 pt divider", "q 72 698 300 3 re f Q", []],
    ["4 pt accents under five headings", HEADING_ACCENTS, []],
    ["a stroked underline", "q 1 0 0 1 72 700 cm 0 0 300 2 re S Q", []],
    ["a small filled square", "q 1 0 0 1 72 700 cm 0 0 6 6 re f Q", []],
    ["a near-full-width thin rule", "q 1 0 0 1 72 700 cm 0 0 454 0.48 re f Q", []],
    ["a thin vertical rule", "q 1 0 0 1 300 200 cm 0 0 0.5 400 re f Q", []],
    ["a full-height sidebar background", "q 0.1 0.1 0.2 rg 0 0 180 792 re f Q", []],
    ["a photo", "q 200 0 0 100 50 500 cm /Im1 Do Q", ["image"]],
    ["a 24 pt logo", "q 24 0 0 24 50 500 cm /Im1 Do Q", ["image"]],
    ["a 16 pt icon", "q 16 0 0 16 50 500 cm /Im1 Do Q", []],
    ["a divider drawn as an image", "q 450 0 0 1 72 700 cm /Im1 Do Q", []],
    ["an inline image", `q 50 0 0 50 300 500 cm ${INLINE_GREY_IMAGE} Q`, ["image"]],
  ])("classifies %s as graphics %j", async (_label, drawing, expected) => {
    const result = await extract([drawing, FILLER_LINE].join("\n"), { xObjects: { Im1: GREY_IMAGE_XOBJECT } });

    expect(result.metadata.layout?.graphics).toEqual(expected);
    expect(result.metadata.layout?.hasGraphics).toBe(expected.length > 0);
  });

  it("measures typography from the visible text using the fonts' own flags", async () => {
    const result = await extract(
      [
        textLine("Budi Sudirman", 72, 740, 16, "F1"),
        textLine("Backend Engineer dengan pengalaman lima tahun", 72, 720, 11, "F2"),
        textLine("Membangun layanan pembayaran untuk jutaan pengguna", 72, 700, 11, "F2"),
        textLine("Memimpin tim kecil berisi empat orang", 72, 680, 11, "F2"),
        textLine("Catatan kecil", 72, 660, 9, "F3"),
      ].join("\n"),
      { fonts: ["Helvetica-Bold", "Helvetica", "Arial"] },
    );
    const typography = result.metadata.typography;

    expect(typography?.fontFamilies).toEqual(expect.arrayContaining(["Helvetica", "Arial"]));
    expect(typography?.bodySize).toBe(11);
    expect(typography?.titleSize).toBe(16);
    expect(typography?.fontSizes).toEqual([9, 11, 16]);
    expect(typography?.margins?.left).toBeCloseTo(72, 1);
    expect(typography?.margins?.top).toBeCloseTo(52, 1);
    expect(typography?.boldRatio).toBe(0);
    expect(typography?.lineSpacing).not.toBeNull();
    expect(runContaining(result, "Budi Sudirman").bold).toBe(true);
    expect(result.metadata.layout).toMatchObject({ columnCount: 1, hasGraphics: false });
  });
});

describe("extractPdf errors", () => {
  it("rejects a page without text as a scan", async () => {
    await expectPdfError(extract(""), "PDF_NO_TEXT_FOUND");
  });

  it("rejects an image-only page as a scan", async () => {
    await expectPdfError(
      extract("q 612 0 0 792 0 0 cm /Im1 Do Q", { xObjects: { Im1: GREY_IMAGE_XOBJECT } }),
      "PDF_NO_TEXT_FOUND",
    );
  });

  it("rejects files without a PDF header", async () => {
    await expectPdfError(extractPdf(Uint8Array.from("hello", (char) => char.charCodeAt(0))), "PDF_INVALID");
  });

  it("rejects files pdf.js cannot open", async () => {
    await expectPdfError(
      extractPdf(Uint8Array.from("%PDF-1.4\nnot really a pdf", (char) => char.charCodeAt(0))),
      "PDF_INVALID",
    );
  });

  it("rejects files over 4 MB before parsing", async () => {
    expect(MAX_PDF_BYTES).toBe(4 * 1024 * 1024);
    await expectPdfError(extractPdf(new Uint8Array(MAX_PDF_BYTES + 1)), "PDF_TOO_LARGE");
  });

  it("rejects PDFs with more than 10 pages", async () => {
    const pages = Array.from({ length: 11 }, (_, index) => [textLine(`Halaman ${index + 1}`, 72, 720), FILLER_LINE].join("\n"));
    await expectPdfError(extract(pages), "PDF_TOO_MANY_PAGES");
  });

  it("rejects a locked PDF", async () => {
    await expectPdfError(extract(FILLER_LINE, { encrypted: true }), "PDF_PASSWORD_PROTECTED");
  });

  it.each([
    ["more than 20,000 text runs", `${FILLER_LINE}\nBT /F1 10 Tf 72 400 Td ${"(a) Tj ".repeat(20_001)}ET`],
    ["more than 5,000 painted shapes", `${FILLER_LINE}\n${"0 0 1 1 re f\n".repeat(5_001)}`],
  ])("rejects a page with %s", async (_label, content) => {
    await expectPdfError(extract(content), "PDF_TOO_COMPLEX");
  });

  it("rejects a page taller than the PDF limit of 14,400 pt", async () => {
    await expectPdfError(
      extractPdf(makePdf([{ content: FILLER_LINE, mediaBox: [0, 0, 612, 14_401] }])),
      "PDF_TOO_COMPLEX",
    );
  });

  it("stops an extraction that runs past its time limit", async () => {
    await expectPdfError(extractPdf(makePdf([FILLER_LINE]), { timeoutMs: 0 }), "PDF_TOO_COMPLEX");
    await expect(extractPdf(makePdf([FILLER_LINE]), { timeoutMs: 20_000 })).resolves.toMatchObject({ pageCount: 1 });
  });

  it("maps pdf.js password errors and passes its own errors through", () => {
    expect(toPdfExtractionError({ name: "PasswordException", message: "No password given" }).code).toBe(
      "PDF_PASSWORD_PROTECTED",
    );
    expect(toPdfExtractionError(new Error("Invalid PDF structure")).code).toBe("PDF_INVALID");
    const own = new PdfExtractionError("PDF_TOO_MANY_PAGES");
    expect(toPdfExtractionError(own)).toBe(own);
  });
});

describe("classifyGraphics", () => {
  const PAGE: PdfBox = { x0: 0, y0: 0, x1: 612, y1: 792 };
  const shape = (kind: PaintedShape["kind"], x0: number, y0: number, width: number, height: number): PaintedShape => ({
    box: { x0, y0, x1: x0 + width, y1: y0 + height },
    kind,
    color: null,
    alpha: 1,
    order: 0,
  });

  it.each<[string, PaintedShape[], string[]]>([
    ["a thin gradient divider", [shape("shading", 72, 700, 450, 2)], []],
    ["a gradient accent under a heading", [shape("shading", 72, 700, 60, 5)], []],
    ["stacked gradient skill bars", [shape("shading", 300, 600, 120, 6), shape("shading", 300, 580, 90, 6)], ["bar"]],
    ["a full-page gradient", [shape("shading", 0, 0, 612, 792)], ["shading"]],
    ["a small gradient badge", [shape("shading", 72, 700, 12, 12)], []],
    ["stacked skill bars drawn as images", [shape("image", 300, 600, 120, 6), shape("image", 300, 580, 120, 6)], ["bar"]],
    ["skill bars that are not aligned", [shape("fill", 300, 600, 120, 6), shape("fill", 340, 580, 120, 6)], []],
  ])("classifies %s", (_label, shapes, expected) => {
    expect(classifyGraphics(shapes, PAGE)).toEqual(expected);
  });
});

describe("chooseTextSource", () => {
  it.each([
    [0, 100, "text-content"],
    [40, 100, "text-content"],
    [60, 100, "operator-list"],
    [100, 100, "operator-list"],
    [0, 10, "operator-list"],
  ] as const)("walker %i vs text content %i chars -> %s", (walker, textContent, expected) => {
    expect(chooseTextSource(walker, textContent)).toBe(expected);
  });
});
