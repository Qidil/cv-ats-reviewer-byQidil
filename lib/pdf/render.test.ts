import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RENDER_LADDER, STANDARD_FONT_DATA_URL, base64Length, renderPagePreviews } from "./render";
import { makePdf, textLine } from "./test-utils/make-pdf";

const TWO_PAGES = makePdf([textLine("Budi Santoso", 72, 740), textLine("Pengalaman", 72, 740)]);
const ROOMY = { budgetBytes: 10_000_000, deadlineMs: 15_000 };

const isWebp = (bytes: Uint8Array) =>
  String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
const totalBase64 = (pages: ReadonlyArray<{ webp: Uint8Array }>) =>
  pages.reduce((sum, page) => sum + base64Length(page.webp.byteLength), 0);

describe("renderPagePreviews (rules.md §3.4)", () => {
  it("renders every page to WebP at the top of the ladder", async () => {
    const pages = await renderPagePreviews(TWO_PAGES, ROOMY);

    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    for (const page of pages) {
      expect(isWebp(page.webp)).toBe(true);
      expect(page.width).toBe(RENDER_LADDER[0].width);
      expect(page.height).toBe(Math.ceil(792 * (RENDER_LADDER[0].width / 612)));
    }
  });

  it("points pdf.js at the standard font files", () => {
    expect(STANDARD_FONT_DATA_URL.endsWith("/")).toBe(true);
    expect(existsSync(`${STANDARD_FONT_DATA_URL}LiberationSans-Regular.ttf`)).toBe(true);
  });

  it("steps down the ladder when all pages together pass the budget", async () => {
    const full = await renderPagePreviews(TWO_PAGES, ROOMY);
    const smaller = await renderPagePreviews(TWO_PAGES, { ...ROOMY, budgetBytes: totalBase64(full) - 1 });

    expect(smaller).toHaveLength(2);
    expect(smaller[0].width).toBe(RENDER_LADDER[1].width);
    expect(totalBase64(smaller)).toBeLessThan(totalBase64(full));
  });

  it("leaves pages out instead of failing", async () => {
    expect(await renderPagePreviews(TWO_PAGES, { ...ROOMY, budgetBytes: 1 })).toEqual([]);
    expect(await renderPagePreviews(TWO_PAGES, { ...ROOMY, deadlineMs: 0 })).toEqual([]);
    expect(await renderPagePreviews(TWO_PAGES, { ...ROOMY, signal: AbortSignal.abort() })).toEqual([]);
    expect(await renderPagePreviews(new TextEncoder().encode("bukan pdf"), ROOMY)).toEqual([]);
  });

  it("stops at the deadline between pages and keeps what was done", async () => {
    let clock = 0;
    const pages = await renderPagePreviews(TWO_PAGES, {
      ...ROOMY,
      deadlineMs: 1_000,
      now: () => {
        clock += 400;
        return clock;
      },
    });

    expect(pages.length).toBeLessThan(2);
  });
});
