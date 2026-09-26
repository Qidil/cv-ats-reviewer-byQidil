/** Builds small, valid PDFs for tests: every string must use characters 0-255 only. */

export interface TestPage {
  content: string;
  mediaBox?: [number, number, number, number];
}

export interface TestPdfOptions {
  /** Standard 14 font names, exposed as /F1, /F2, ... */
  fonts?: string[];
  /** ExtGState dictionaries by resource name, e.g. { GS0: "<< /Type /ExtGState /ca 0 >>" }. */
  extGStates?: Record<string, string>;
  /** Complete XObject stream objects by resource name; build them with pdfStream(). */
  xObjects?: Record<string, string>;
  /** Adds a standard security handler that the empty user password does not open. */
  encrypted?: boolean;
  /** ToUnicode overrides for /F1, from character code to Unicode code point. */
  toUnicode?: Record<number, number>;
}

export function pdfStream(dictionary: string, data: string): string {
  return `<< ${dictionary} /Length ${data.length} >>\nstream\n${data}\nendstream`;
}

function toUnicodeCMap(map: Record<number, number>): string {
  const hex = (value: number, width: number) => value.toString(16).toUpperCase().padStart(width, "0");
  const entries = Object.entries(map).map(([code, unicode]) => `<${hex(Number(code), 2)}> <${hex(unicode, 4)}>`);
  return [
    "/CIDInit /ProcSet findresource begin 12 dict begin begincmap",
    "/CMapName /TestToUnicode def /CMapType 2 def",
    "1 begincodespacerange <00> <FF> endcodespacerange",
    `${entries.length} beginbfchar`,
    ...entries,
    "endbfchar",
    "endcmap CMapName currentdict /CMap defineresource pop end end",
  ].join("\n");
}

/** One grey pixel, drawn by the current CTM as the unit square. */
export const GREY_IMAGE_XOBJECT = pdfStream(
  "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
  String.fromCharCode(128),
);

export const INLINE_GREY_IMAGE = `BI /W 1 /H 1 /CS /G /BPC 8 ID ${String.fromCharCode(128)} EI`;

export function textLine(text: string, x: number, y: number, size = 11, font = "F1"): string {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${text}) Tj ET`;
}

/** 55 visible characters, enough to pass the 50-character scanned-PDF check on its own. */
export const FILLER_LINE = textLine("Pengalaman kerja sebagai pengembang perangkat lunak lima tahun", 72, 100, 10);

export function makePdf(pages: ReadonlyArray<string | TestPage>, options: TestPdfOptions = {}): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);

  const catalog = add("");
  const pagesRoot = add("");
  const fontNumbers = (options.fonts ?? ["Helvetica"]).map((font) =>
    add(`<< /Type /Font /Subtype /Type1 /BaseFont /${font} >>`),
  );
  if (options.toUnicode) {
    const cmap = add(pdfStream("", toUnicodeCMap(options.toUnicode)));
    objects[fontNumbers[0] - 1] = objects[fontNumbers[0] - 1].replace(" >>", ` /ToUnicode ${cmap} 0 R >>`);
  }
  const fontRefs = fontNumbers.map((number, index) => `/F${index + 1} ${number} 0 R`).join(" ");
  const gsRefs = Object.entries(options.extGStates ?? {})
    .map(([name, dictionary]) => `/${name} ${add(dictionary)} 0 R`)
    .join(" ");
  const xObjectRefs = Object.entries(options.xObjects ?? {})
    .map(([name, stream]) => `/${name} ${add(stream)} 0 R`)
    .join(" ");
  const resources = [
    `/Font << ${fontRefs} >>`,
    gsRefs ? `/ExtGState << ${gsRefs} >>` : "",
    xObjectRefs ? `/XObject << ${xObjectRefs} >>` : "",
  ].join(" ");

  const pageRefs = pages.map((entry) => {
    const page = typeof entry === "string" ? { content: entry } : entry;
    const contents = add(pdfStream("", page.content));
    const box = (page.mediaBox ?? [0, 0, 612, 792]).join(" ");
    return add(
      `<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [${box}] /Contents ${contents} 0 R /Resources << ${resources} >> >>`,
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`;
  objects[pagesRoot - 1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;
  const encryption = options.encrypted
    ? ` /Encrypt ${add(`<< /Filter /Standard /V 1 /R 2 /O <${"ab".repeat(32)}> /U <${"ab".repeat(32)}> /P -4 >>`)} 0 R /ID [<${"cd".repeat(16)}> <${"cd".repeat(16)}>]`
    : "";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R${encryption} >>\nstartxref\n${xref}\n%%EOF\n`;

  return Uint8Array.from(pdf, (char) => char.charCodeAt(0) & 0xff);
}
