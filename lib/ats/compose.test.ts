import { beforeAll, describe, expect, it } from "vitest";
import type { AiReport } from "@/lib/ai/parser";
import { extractPdf } from "@/lib/pdf/extractor";
import { makePdf, textLine } from "@/lib/pdf/test-utils/make-pdf";
import type { PdfExtraction } from "@/lib/pdf/types";
import { ATS_CHECK_WEIGHTS } from "@/types/ats";
import { composeReport, createSnippetLocator } from "./compose";
import { CHECK_NAMES, analyzeCv, type DeterministicReport } from "./rubric";

const PAGE_ONE = [
  "Budi Santoso",
  "budi.santoso@email.com",
  "+6281234567890",
  "Ringkasan",
  "Backend developer dengan 5 tahun pengalaman membangun layanan pembayaran.",
  "Keahlian",
  "- TypeScript",
  "- PostgreSQL",
];
const PAGE_TWO = [
  "Pengalaman",
  "- Memangkas waktu respons API sebesar 40% untuk 2 juta pengguna.",
  "- Menulis dokumentasi teknis untuk tim mobile.",
  "Pendidikan",
  "S1 Teknik Informatika, Universitas Gadjah Mada",
];
const HIDDEN = "Kubernetes Terraform Golang";
const PLAIN_BULLET = "Menulis dokumentasi teknis untuk tim mobile.";
const JD = "Membutuhkan TypeScript, PostgreSQL, dan Kubernetes.";

let extraction: PdfExtraction;
let deterministic: DeterministicReport;

beforeAll(async () => {
  const page = (lines: string[]) => lines.map((line, index) => textLine(line, 72, 740 - index * 16)).join("\n");
  extraction = await extractPdf(makePdf([page(PAGE_ONE), `${page(PAGE_TWO)}\nq 1 1 1 rg ${textLine(HIDDEN, 72, 300)} Q`]));
  deterministic = analyzeCv(extraction.visibleText, JD, extraction.metadata);
});

function aiReport(overrides: Partial<AiReport> = {}): AiReport {
  return {
    checks: {
      keyword: { score: 79, detail: "TypeScript dan PostgreSQL ada, Kubernetes tidak ada." },
      skills: { score: 80, detail: "Dua dari tiga keahlian wajib ada." },
      sections: { score: 59, detail: "Bagian Ringkasan terlalu singkat." },
      formatting: { score: 5, detail: "AI menilai format buruk." },
      quantified: { score: 60, detail: "1 dari 2 bullet memuat angka." },
      readability: { score: 100, detail: "Kalimat ringkas." },
    },
    weaknesses: ["Satu bullet pengalaman belum memuat angka."],
    suggestions: [
      {
        title: "Tambahkan angka pada pencapaian",
        description: `Ubah "${PLAIN_BULLET}" menjadi "Menulis [jumlah] dokumen teknis untuk tim mobile".`,
        category: "achievements",
        priority: "high",
        targetTextSnippet: PLAIN_BULLET,
      },
      {
        title: "Tulis Kubernetes di Keahlian",
        description: "Tambahkan Kubernetes ke bagian Keahlian bila memang pernah dipakai.",
        category: "keywords",
        priority: "medium",
        targetTextSnippet: "",
      },
    ],
    suggestedJobs: [
      { title: "Backend Engineer", matchScore: 82, reason: "Membangun layanan pembayaran.", keyStrengths: ["TypeScript"], missingSkills: ["Kubernetes"] },
    ],
    ...overrides,
  };
}

describe("composeReport scores", () => {
  it("takes the AI's scores except formatting and recomputes statuses and the overall score", () => {
    const report = composeReport({ mode: "mode-a", deterministic, ai: aiReport(), extraction });
    const byId = new Map(report.atsChecks.map((check) => [check.id, check]));

    expect(byId.get("keyword")).toMatchObject({ score: 79, status: "warn", name: CHECK_NAMES.keyword });
    expect(byId.get("skills")).toMatchObject({ score: 80, status: "pass" });
    expect(byId.get("sections")).toMatchObject({ score: 59, status: "fail" });
    expect(byId.get("quantified")).toMatchObject({ score: 60, status: "warn" });
    expect(byId.get("formatting")).toEqual(deterministic.atsChecks.find((check) => check.id === "formatting"));
    expect(report.overallScore).toBe(
      Math.round(report.atsChecks.reduce((sum, check) => sum + check.score * ATS_CHECK_WEIGHTS[check.id], 0) / 100),
    );
  });

  it("falls back to the rubric check when the AI leaves one out or gives no detail", () => {
    const report = composeReport({
      mode: "mode-a",
      deterministic,
      ai: aiReport({ checks: { keyword: { score: 95, detail: "" } } }),
      extraction,
    });

    expect(report.atsChecks).toEqual(deterministic.atsChecks);
    expect(report.overallScore).toBe(deterministic.overallScore);
  });
});

describe("composeReport suggestions", () => {
  it("puts the hidden-text notice first, the AI suggestions next, and typography last", () => {
    const ids = composeReport({ mode: "mode-a", deterministic, ai: aiReport(), extraction }).suggestions.map(
      (suggestion) => suggestion.id,
    );
    const typography = ids.filter((id) => id.startsWith("typo-"));

    expect(ids.slice(0, 3)).toEqual(["hidden-text", "sug-01", "sug-02"]);
    expect(typography.length).toBeGreaterThan(0);
    expect(ids.slice(3)).toEqual(typography);
  });

  it("keeps a snippet found in the CV with its page and drops the empty one", () => {
    const [first, second] = composeReport({ mode: "mode-a", deterministic, ai: aiReport(), extraction }).suggestions.filter(
      (suggestion) => suggestion.id.startsWith("sug-"),
    );

    expect(first).toMatchObject({ targetTextSnippet: PLAIN_BULLET, pageNumber: 2, priority: "high" });
    expect(second).not.toHaveProperty("targetTextSnippet");
    expect(second).not.toHaveProperty("pageNumber");
  });

  it("uses the rubric's suggestions when the AI gave none", () => {
    const report = composeReport({ mode: "mode-a", deterministic, ai: aiReport({ suggestions: [] }), extraction });
    const expected = deterministic.suggestions.filter((suggestion) => suggestion.id.startsWith("sug-")).map((s) => s.id);

    expect(report.suggestions.filter((suggestion) => suggestion.id.startsWith("sug-")).map((s) => s.id)).toEqual(expected);
  });

  it("uses the AI's weaknesses when it has some and the rubric's otherwise", () => {
    expect(composeReport({ mode: "mode-a", deterministic, ai: aiReport(), extraction }).weaknesses).toEqual([
      "Satu bullet pengalaman belum memuat angka.",
    ]);
    expect(composeReport({ mode: "mode-a", deterministic, ai: aiReport({ weaknesses: [] }), extraction }).weaknesses).toEqual(
      deterministic.weaknesses,
    );
  });

  it("returns job suggestions only in Mode B", () => {
    expect(composeReport({ mode: "mode-a", deterministic, ai: aiReport(), extraction }).suggestedJobs).toEqual([]);
    expect(composeReport({ mode: "mode-b", deterministic, ai: aiReport(), extraction }).suggestedJobs).toHaveLength(1);
  });
});

describe("createSnippetLocator", () => {
  it("finds a snippet whatever its spacing or surrounding quotes", () => {
    const locate = createSnippetLocator(extraction);

    expect(locate(`  \u201cMenulis   dokumentasi teknis\nuntuk tim mobile.\u201d `)).toEqual({ text: PLAIN_BULLET, pageNumber: 2 });
    expect(locate("Backend developer dengan 5 tahun")).toEqual({ text: "Backend developer dengan 5 tahun", pageNumber: 1 });
  });

  it("rejects a snippet that is not in the visible text, hidden text included", () => {
    const locate = createSnippetLocator(extraction);

    expect(extraction.rawText).toContain(HIDDEN);
    expect(locate(HIDDEN)).toBeNull();
    expect(locate("Memimpin tim beranggotakan 12 orang")).toBeNull();
    expect(locate(" \u201c\u201d ")).toBeNull();
  });
});
