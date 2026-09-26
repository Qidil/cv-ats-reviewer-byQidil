import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeCv } from "@/lib/ats/rubric";
import { extractPdf } from "./extractor";
import { loadPdfjs } from "./pdfjs";

/**
 * Local only: runs on real CVs in project-context/cv-test, which is gitignored. Test names, logs,
 * and assertions carry counts only, never CV text or file names.
 */
const SAMPLE_DIR = fileURLToPath(new URL("../../project-context/cv-test/", import.meta.url));
const SAMPLE_FILES = existsSync(SAMPLE_DIR)
  ? readdirSync(SAMPLE_DIR)
      .filter((name) => name.toLowerCase().endsWith(".pdf"))
      .sort()
  : [];
const MIN_WORD_SIMILARITY = 0.9;
const GENERIC_JD = "Kami mencari backend developer yang menguasai TypeScript, Node.js, SQL, dan Docker.";

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  let shared = 0;
  for (const word of a) {
    if (b.has(word)) shared++;
  }
  return shared / (a.size + b.size - shared);
}

/** pdf.js text content, the reference the walker's text is compared with. */
async function textContent(data: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: data.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  try {
    const doc = await task.promise;
    const parts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const content = await (await doc.getPage(pageNumber)).getTextContent();
      for (const item of content.items) {
        if ("str" in item) {
          parts.push(item.str, item.hasEOL ? "\n" : " ");
        }
      }
    }
    return parts.join("");
  } finally {
    await task.destroy();
  }
}

describe("real CV samples (local only)", () => {
  if (SAMPLE_FILES.length === 0) {
    it.skip("needs at least one PDF in project-context/cv-test", () => {});
    return;
  }

  SAMPLE_FILES.forEach((file, index) => {
    it(`sample ${index + 1} extracts, keeps offsets, and scores`, { timeout: 30_000 }, async () => {
      const data = new Uint8Array(readFileSync(join(SAMPLE_DIR, file)));
      const result = await extractPdf(data);
      const modeA = analyzeCv(result.visibleText, GENERIC_JD, result.metadata);
      const modeB = analyzeCv(result.visibleText, "", result.metadata);
      const similarity = jaccard(words(result.rawText), words(await textContent(data)));
      const offsetMismatches = result.runs.filter(
        (run) => result.rawText.slice(run.textStart, run.textEnd) !== run.text,
      ).length;
      const hiddenRuns = result.runs.filter((run) => run.hidden).length;
      const layout = result.metadata.layout;

      console.info(
        [
          `sample ${index + 1}:`,
          `${result.pageCount} page(s)`,
          `source ${result.source}`,
          `${result.runs.length} runs`,
          `${hiddenRuns} hidden`,
          `${result.visibleText.replace(/\s/g, "").length} visible chars`,
          `word similarity ${similarity.toFixed(3)}`,
          `${result.metadata.typography?.fontFamilies.length ?? 0} font families`,
          `columns ${layout?.columnCount ?? "n/a"}`,
          `graphics [${layout?.graphics.join(", ") ?? "n/a"}]`,
          `ocr pages ${layout?.ocrPages.length ?? "n/a"}`,
          `score A ${modeA.overallScore}`,
          `score B ${modeB.overallScore}`,
          `checks A [${modeA.atsChecks.map((item) => `${item.id} ${item.score}`).join(", ")}]`,
          `suggestions A [${modeA.suggestions.map((item) => item.id).join(", ")}]`,
          `suggestions B [${modeB.suggestions.map((item) => item.id).join(", ")}]`,
        ].join(", "),
      );

      expect(offsetMismatches).toBe(0);
      expect(result.visibleText.replace(/\s/g, "").length).toBeGreaterThanOrEqual(50);
      expect(hiddenRuns).toBe(result.metadata.hiddenText.runCount);
      if (result.source === "operator-list") {
        expect(similarity).toBeGreaterThanOrEqual(MIN_WORD_SIMILARITY);
      }
      for (const report of [modeA, modeB]) {
        expect(report.atsChecks).toHaveLength(6);
        expect(report.overallScore).toBeGreaterThanOrEqual(0);
        expect(report.overallScore).toBeLessThanOrEqual(100);
      }
    });
  });
});
