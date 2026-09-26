import { describe, expect, it } from "vitest";
import { extractPdf } from "@/lib/pdf/extractor";
import { makePdf, textLine } from "@/lib/pdf/test-utils/make-pdf";
import type { HiddenTextSummary, LayoutMetadata, PdfMetadata, TypographyMetadata } from "@/lib/pdf/types";
import { ATS_CHECK_IDS, ATS_CHECK_WEIGHTS, type AtsCheck, type AtsCheckId } from "@/types/ats";
import {
  CHECK_NAMES,
  analyzeCv,
  computeWeightedScore,
  deriveTypographyFindings,
  statusFor,
  type DeterministicReport,
} from "./rubric";

const SAMPLE_CV = [
  "Budi Santoso",
  "budi.santoso@email.com",
  "+6281234567890",
  "",
  "Summary",
  "Backend developer dengan 5 tahun pengalaman di Node.js dan TypeScript.",
  "",
  "Skills",
  "- Node.js",
  "- TypeScript",
  "- SQL",
  "- Docker",
  "",
  "Experience",
  "- Backend Developer at PT Maju (2021-2024): Meningkatkan performa API sebesar 30%.",
  "- Junior Developer at PT Cepat (2019-2021): Membangun REST API untuk 3 produk.",
  "",
  "Education",
  "- S1 Teknik Informatika, Universitas Indonesia (2015-2019)",
].join("\n");

const SAMPLE_JD = "Kami mencari React, TypeScript, Node.js, SQL, Docker, dan Kubernetes untuk tim backend.";

/** Scores 100 on every check against STRONG_JD. */
const STRONG_CV_LINES = [
  "Budi Santoso",
  "budi.santoso@email.com",
  "+62 812 3456 7890",
  "Ringkasan",
  "Backend engineer dengan pengalaman membangun layanan pembayaran berskala besar memakai Ruby dan Python.",
  "Keahlian",
  "Ruby, Python, PostgreSQL, Redis",
  "Pengalaman",
  "- Memangkas waktu respons API sebesar 40% untuk 2 juta pengguna aktif.",
  "- Memimpin migrasi 12 layanan ke container tanpa downtime.",
  "- Menurunkan biaya server bulanan sebesar 25% lewat caching.",
  "Pendidikan",
  "S1 Teknik Informatika, Universitas Gadjah Mada, 2014 sampai 2018",
];
const STRONG_CV = STRONG_CV_LINES.join("\n");
const STRONG_JD = "Membutuhkan ruby dan python.";

/** Six checks under 80 against SAMPLE_JD: quantified 0, formatting 25, skills 29, keyword 42, sections 75, readability 75. */
const WEAK_CV = [
  "Budi Santoso",
  "Summary",
  "Backend developer yang suka belajar hal baru setiap hari.",
  "Skills",
  "- Node.js",
  "- TypeScript",
  "Experience",
  "- Membangun API untuk tim internal.",
  "- Menulis dokumentasi teknis.",
].join("\n");

const NO_HIDDEN_TEXT: HiddenTextSummary = {
  checked: true,
  runCount: 0,
  charCount: 0,
  hasWords: false,
  reasons: [],
  samples: [],
};

const CLEAN_TYPOGRAPHY: TypographyMetadata = {
  fonts: [
    { family: "Helvetica", bold: false, italic: false, size: 11, charCount: 900 },
    { family: "Helvetica", bold: true, italic: false, size: 16, charCount: 12 },
  ],
  fontFamilies: ["Helvetica"],
  fontSizes: [11, 16],
  bodySize: 11,
  titleSize: 16,
  lineSpacing: 1.2,
  margins: { left: 72, right: 72, top: 72, bottom: 72 },
  boldRatio: 0.05,
  italicRatio: 0,
};

const CLEAN_LAYOUT: LayoutMetadata = { columnCount: 1, hasGraphics: false, graphics: [], ocrPages: [] };

const CLEAN_METADATA: PdfMetadata = { typography: CLEAN_TYPOGRAPHY, layout: CLEAN_LAYOUT, hiddenText: NO_HIDDEN_TEXT };

function withTypography(overrides: Partial<TypographyMetadata>): PdfMetadata {
  return { ...CLEAN_METADATA, typography: { ...CLEAN_TYPOGRAPHY, ...overrides } };
}

function withLayout(overrides: Partial<LayoutMetadata>): PdfMetadata {
  return { ...CLEAN_METADATA, layout: { ...CLEAN_LAYOUT, ...overrides } };
}

function withHiddenText(overrides: Partial<HiddenTextSummary>): PdfMetadata {
  return { ...CLEAN_METADATA, hiddenText: { ...NO_HIDDEN_TEXT, ...overrides } };
}

function check(report: DeterministicReport, id: AtsCheckId): AtsCheck {
  const found = report.atsChecks.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`Missing check ${id}`);
  }
  return found;
}

function scoresOf(report: DeterministicReport): Array<Pick<AtsCheck, "id" | "score" | "status">> {
  return report.atsChecks.map(({ id, score, status }) => ({ id, score, status }));
}

function checksWith(scores: Partial<Record<AtsCheckId, number>>): AtsCheck[] {
  return (Object.entries(scores) as Array<[AtsCheckId, number]>).map(([id, score]) => ({
    id,
    name: CHECK_NAMES[id],
    status: statusFor(score),
    score,
    detail: "",
  }));
}

const CATEGORY_CHECK: Readonly<Record<string, AtsCheckId>> = {
  keywords: "keyword",
  skills: "skills",
  structure: "sections",
  format: "formatting",
  achievements: "quantified",
  readability: "readability",
};

describe("analyzeCv checks", () => {
  it("returns the six checks in BR-03 order with their names", () => {
    const report = analyzeCv(SAMPLE_CV, SAMPLE_JD, CLEAN_METADATA);

    expect(report.atsChecks.map((item) => item.id)).toEqual([...ATS_CHECK_IDS]);
    for (const item of report.atsChecks) {
      expect(item.name).toBe(CHECK_NAMES[item.id]);
      expect(Number.isInteger(item.score)).toBe(true);
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
      expect(item.detail).not.toBe("");
    }
  });

  it("lists the JD keywords missing from the CV", () => {
    const report = analyzeCv(SAMPLE_CV, SAMPLE_JD);

    // 7 terms: react, typescript, node.js, sql, docker, kubernetes, backend. (4 × 1.2 + 1.1) / 8.4 = 70%
    expect(check(report, "keyword")).toMatchObject({ score: 70, detail: "Belum ada di CV: react, kubernetes." });
    expect(check(report, "skills")).toMatchObject({
      score: 57,
      detail: "Bagian Keahlian belum memuat: react, kubernetes, backend.",
    });
  });

  it("names the missing section", () => {
    const withoutEducation = SAMPLE_CV.replace(/\nEducation[\s\S]*$/, "");
    const sections = check(analyzeCv(withoutEducation, SAMPLE_JD), "sections");

    expect(sections.score).toBe(75);
    expect(sections.detail).toBe("Bagian yang belum ada: Pendidikan.");
  });

  it("recognizes Indonesian and decorated headings", () => {
    const cv = [
      "Budi Santoso",
      "## Ringkasan",
      "Backend engineer.",
      "Pengalaman Kerja:",
      "- Membangun API.",
      "**Pendidikan**",
      "S1 Informatika",
      "Keahlian",
      "Ruby",
    ].join("\n");

    expect(check(analyzeCv(cv, STRONG_JD), "sections").score).toBe(100);
  });

  it("asks for an email and a phone number when both are missing", () => {
    const cv = STRONG_CV_LINES.filter((line) => !line.includes("@") && !line.startsWith("+62")).join("\n");
    const formatting = check(analyzeCv(cv, STRONG_JD, CLEAN_METADATA), "formatting");

    expect(formatting.score).toBe(50);
    expect(formatting.detail).toContain("belum ada email, belum ada nomor telepon");
  });

  it("rewards bullets with numbers", () => {
    const metricCv = [
      "Summary",
      "Engineer.",
      "Skills",
      "- React",
      "Experience",
      "- Cut load time by 30%.",
      "- Built 3 microservices.",
      "- Wrote tests.",
    ].join("\n");
    const plainCv = metricCv.replace("by 30%", "a lot").replace("Built 3", "Built");

    // The Skills bullet "- React" is a list item, so 2 of the 3 Experience bullets count.
    expect(check(analyzeCv(metricCv, SAMPLE_JD), "quantified").score).toBe(67);
    expect(check(analyzeCv(plainCv, SAMPLE_JD), "quantified").score).toBe(0);
  });

  it("stays between 0 and 100 for an empty CV", () => {
    const report = analyzeCv("", SAMPLE_JD);

    expect(report.atsChecks).toHaveLength(6);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  it("turns checks under 80 into weaknesses and up to three suggestions, lowest score first", () => {
    const report = analyzeCv(WEAK_CV, SAMPLE_JD, CLEAN_METADATA);
    const weak = report.atsChecks.filter((item) => item.score < 80);
    const suggestions = report.suggestions.filter((suggestion) => suggestion.id.startsWith("sug-"));
    const scores = suggestions.map((suggestion) => check(report, CATEGORY_CHECK[suggestion.category]).score);

    expect(weak).toHaveLength(6);
    expect(report.weaknesses).toEqual(weak.map((item) => `${item.name}: ${item.score}/100. ${item.detail}`));
    expect(suggestions.map((suggestion) => suggestion.id)).toEqual(["sug-01", "sug-02", "sug-03"]);
    expect(scores).toEqual([0, 25, 29]);
    suggestions.forEach((suggestion, index) => {
      const score = scores[index];
      expect(suggestion.priority).toBe(score < 40 ? "high" : score < 60 ? "medium" : "low");
      expect(suggestion.title).not.toBe("");
      expect(suggestion.description).not.toBe("");
    });
  });

  it("adds no weaknesses or suggestions when every check passes", () => {
    const report = analyzeCv(STRONG_CV, STRONG_JD, CLEAN_METADATA);

    expect(report.atsChecks.every((item) => item.score === 100 && item.status === "pass")).toBe(true);
    expect(report.overallScore).toBe(100);
    expect(report.weaknesses).toEqual([]);
    expect(report.suggestions).toEqual([]);
  });

  it("quotes a bullet without numbers verbatim in the achievements suggestion", () => {
    const cv = STRONG_CV.replace("lewat caching.", "lewat caching.\n- Menulis dokumentasi API untuk tim mobile.");
    const report = analyzeCv(cv, STRONG_JD, CLEAN_METADATA);

    expect(check(report, "quantified").score).toBe(75);
    expect(report.suggestions).toEqual([
      expect.objectContaining({
        id: "sug-01",
        category: "achievements",
        priority: "low",
        targetTextSnippet: "Menulis dokumentasi API untuk tim mobile.",
      }),
    ]);
    expect(cv).toContain(report.suggestions[0].targetTextSnippet);
  });

  it("reports a JD without usable terms", () => {
    const report = analyzeCv(SAMPLE_CV, "!!!");

    expect(check(report, "keyword")).toMatchObject({
      score: 0,
      status: "fail",
      detail: "Deskripsi pekerjaan terlalu pendek untuk diambil kata kuncinya.",
    });
    expect(check(report, "skills")).toMatchObject({
      score: 0,
      status: "fail",
      detail: "Deskripsi pekerjaan terlalu pendek untuk menilai cakupan keahlian.",
    });
  });

  it("leaves keyword and skills matching to the AI in Mode B", () => {
    const report = analyzeCv(SAMPLE_CV, "");

    for (const id of ["keyword", "skills"] as const) {
      expect(check(report, id)).toMatchObject({ score: 0, status: "warn" });
      expect(check(report, id).detail).toContain("Mode B");
    }
  });

  it("keeps the Mode B checks out of weaknesses and suggestions", () => {
    const withoutSkills = SAMPLE_CV.replace(/\nSkills[\s\S]*?\n\n/, "\n");
    const report = analyzeCv(withoutSkills, "", CLEAN_METADATA);
    const deferredNames = [CHECK_NAMES.keyword, CHECK_NAMES.skills];

    expect(check(report, "skills").detail).toContain("Mode B");
    expect(report.weaknesses.some((weakness) => deferredNames.some((name) => weakness.startsWith(name)))).toBe(false);
    expect(report.suggestions.map((suggestion) => suggestion.category)).not.toContain("keywords");
    expect(report.suggestions.map((suggestion) => suggestion.category)).not.toContain("skills");
    expect(report.suggestions.map((suggestion) => suggestion.category)).toContain("structure");
  });

  it("fails the skills check without a Skills section", () => {
    const withoutSkills = SAMPLE_CV.replace(/\nSkills[\s\S]*?\n\n/, "\n");
    const skills = check(analyzeCv(withoutSkills, SAMPLE_JD), "skills");

    expect(skills).toMatchObject({ score: 0, status: "fail", detail: "Bagian Keahlian tidak ditemukan di CV." });
  });
});

describe("quantified achievements", () => {
  it("counts only bullets outside Skills and Education", () => {
    const quantified = check(analyzeCv(SAMPLE_CV, SAMPLE_JD), "quantified");

    expect(quantified).toMatchObject({ score: 100, detail: "2 dari 2 bullet point memuat angka atau metrik." });
  });

  it("counts a Projects section that follows Education", () => {
    const cv = `${SAMPLE_CV}\n\nProyek\n- Membuat aplikasi kasir untuk toko keluarga.`;
    const report = analyzeCv(cv, SAMPLE_JD, CLEAN_METADATA);

    expect(check(report, "quantified").score).toBe(67);
    expect(report.suggestions).toContainEqual(
      expect.objectContaining({ category: "achievements", targetTextSnippet: "Membuat aplikasi kasir untuk toko keluarga." }),
    );
  });

  it("falls back to every bullet when all of them sit in Skills or Education", () => {
    const cv = ["Summary", "Engineer.", "Skills", "- Python", "- Go"].join("\n");

    expect(check(analyzeCv(cv, STRONG_JD), "quantified").detail).toBe("0 dari 2 bullet point memuat angka atau metrik.");
  });
});

describe("keyword matching", () => {
  it("matches two-word phrases as a unit", () => {
    const jd = "Kami membutuhkan developer dengan keahlian data visualization dan stakeholder management.";
    const together = SAMPLE_CV.replace("- Docker", "- Docker\n- Data Visualization");
    const apart = SAMPLE_CV.replace("- Docker", "- Docker\n- Data dan Visualization");

    expect(check(analyzeCv(together, jd), "keyword").detail).not.toMatch(/data visualization/);
    expect(check(analyzeCv(apart, jd), "keyword").detail).toMatch(/data visualization/);
  });

  it("does not build phrases across punctuation", () => {
    const keyword = check(analyzeCv("Budi Santoso", "Membutuhkan CI/CD, Docker - Kubernetes; Terraform."), "keyword");

    expect(keyword.detail).toBe("Belum ada di CV: ci, cd, docker, kubernetes, terraform.");
  });

  it("weights a keyword in Skills above the same keyword elsewhere", () => {
    const jd = "Membutuhkan ruby.";
    const inSkills = SAMPLE_CV.replace("- Docker", "- Docker\n- Ruby");
    const inExperience = SAMPLE_CV.replace("30%.", "30%. Ruby dipakai untuk build pipeline.");

    expect(check(analyzeCv(inSkills, jd), "keyword").score).toBe(100);
    expect(check(analyzeCv(inExperience, jd), "keyword").score).toBe(83);
  });

  it("adds a bonus for a long Skills list", () => {
    const jd = "Membutuhkan python dan golang.";
    const cvWithSkills = (skills: string) => ["Summary", "Engineer.", "Skills", skills, "Experience", "- Do things."].join("\n");
    const list = (count: number) => ["Python", ...Array.from({ length: count - 1 }, (_, i) => `Skill${i + 2}`)].join(", ");

    expect(check(analyzeCv(cvWithSkills("- Python\n- Go"), jd), "skills").score).toBe(50);
    expect(check(analyzeCv(cvWithSkills(list(10)), jd), "skills").score).toBe(53);
    expect(check(analyzeCv(cvWithSkills(list(15)), jd), "skills").score).toBe(55);
  });

  it("caps the missing-keyword list at 15 terms", () => {
    const terms = [
      "kafka", "redis", "graphql", "terraform", "ansible", "jenkins", "prometheus", "grafana", "elasticsearch",
      "rabbitmq", "nginx", "kotlin", "swift", "flutter", "scala", "haskell", "elixir", "clojure", "rust", "erlang",
    ];
    const keyword = check(analyzeCv(SAMPLE_CV, terms.join(" dan ")), "keyword");

    expect(keyword.score).toBe(0);
    expect(keyword.detail).toBe(`Belum ada di CV: ${terms.slice(0, 15).join(", ")}, dan 5 lainnya.`);
  });
});

describe("formatting (BR-05)", () => {
  const formattingScore = (cv: string, metadata: PdfMetadata | null = CLEAN_METADATA) =>
    check(analyzeCv(cv, SAMPLE_JD, metadata), "formatting").score;

  it("takes 15 points for a table and 10 for tab layouts", () => {
    const table = "\n| Skill | Level |\n| Node.js | Expert |";
    const tabs = "\nPosisi\tPerusahaan\nBackend\tPT Maju";

    expect(formattingScore(SAMPLE_CV)).toBe(100);
    expect(formattingScore(SAMPLE_CV + table)).toBe(85);
    expect(formattingScore(SAMPLE_CV + tabs)).toBe(90);
    expect(formattingScore(SAMPLE_CV + table + tabs)).toBe(75);
  });

  it("does not treat a pipe-separated contact line as a table", () => {
    const contactLine = SAMPLE_CV.replace("budi.santoso@email.com", "budi.santoso@email.com | +6281234567890 | Jakarta");

    expect(formattingScore(contactLine)).toBe(100);
  });

  it("does not read year ranges as a phone number", () => {
    const cv = [
      ...STRONG_CV_LINES.filter((line) => !line.startsWith("+62")),
      "PT Maju, 2019-2021",
      "PT Cepat, 2015-2017 2017-2019",
    ].join("\n");
    const formatting = check(analyzeCv(cv, STRONG_JD, CLEAN_METADATA), "formatting");

    expect(formatting.detail).toContain("belum ada nomor telepon");
  });

  it.each(["+62 812-3456-7890", "0812 3456 7890", "(021) 555 1234", "+6281234567890"])(
    "recognizes the phone number %s",
    (phone) => {
      const cv = STRONG_CV.replace("+62 812 3456 7890", phone);
      expect(check(analyzeCv(cv, STRONG_JD, CLEAN_METADATA), "formatting").detail).not.toContain(
        "belum ada nomor telepon",
      );
    },
  );

  it("states the length limit in words", () => {
    const report = analyzeCv(WEAK_CV, SAMPLE_JD, CLEAN_METADATA);

    expect(check(report, "formatting").detail).toContain("panjang CV di luar 50 sampai 1.200 kata");
    expect(check(report, "readability").detail).toContain("panjang CV di luar 50 sampai 1.200 kata");
  });

  it("counts inline bullet glyphs as bullets", () => {
    const cv = [
      "Budi Santoso",
      "budi.santoso@email.com",
      "+6281200000000",
      "",
      "Summary",
      "Backend engineer dengan pengalaman membangun REST API dan layanan mikro.",
      "",
      "Experience",
      "● Memimpin tim backend dan meningkatkan performa API sebesar 30%.",
      "PT Perusahaan ● Mengelola 5 layanan produksi dengan SLA 99,9%.",
    ].join("\n");

    expect(check(analyzeCv(cv, SAMPLE_JD), "formatting").detail).not.toContain("bullet point");
  });

  it("keeps formatting at warn and says why when the PDF metadata is missing", () => {
    const formatting = check(analyzeCv(SAMPLE_CV, SAMPLE_JD, null), "formatting");

    expect(formatting.status).toBe("warn");
    expect(formatting.score).toBe(formattingScore(SAMPLE_CV));
    expect(formatting.detail).toContain("Tipografi dan tata letak tidak dapat dinilai untuk PDF ini.");
  });

  it("says hidden text was not screened after the text-content fallback", () => {
    const fallback: PdfMetadata = { typography: null, layout: null, hiddenText: { ...NO_HIDDEN_TEXT, checked: false } };
    const formatting = check(analyzeCv(SAMPLE_CV, SAMPLE_JD, fallback), "formatting");

    expect(formatting.status).toBe("warn");
    expect(formatting.detail).toContain("Tipografi dan tata letak tidak dapat dinilai untuk PDF ini.");
    expect(formatting.detail).toContain("Teks tersembunyi tidak dapat diperiksa untuk PDF ini.");
  });

  it.each<[string, Partial<LayoutMetadata>, number, string]>([
    ["a two-column layout", { columnCount: 2 }, 85, "tata letak 2 kolom"],
    ["skill bars", { hasGraphics: true, graphics: ["bar"] }, 85, "bar keahlian atau grafik"],
    ["an embedded photo", { hasGraphics: true, graphics: ["image"] }, 85, "gambar atau foto"],
    ["a gradient background", { hasGraphics: true, graphics: ["shading"] }, 85, "latar gradasi"],
    ["two columns and a photo", { columnCount: 2, hasGraphics: true, graphics: ["image"] }, 70, "tata letak 2 kolom"],
  ])("penalizes %s", (_label, layout, expected, phrase) => {
    const formatting = check(analyzeCv(SAMPLE_CV, SAMPLE_JD, withLayout(layout)), "formatting");

    expect(formatting.score).toBe(expected);
    expect(formatting.status).toBe(statusFor(expected));
    expect(formatting.detail).toContain(phrase);
  });

  it("notes OCR pages without changing the score", () => {
    const formatting = check(analyzeCv(SAMPLE_CV, SAMPLE_JD, withLayout({ ocrPages: [1] })), "formatting");

    expect(formatting.score).toBe(100);
    expect(formatting.detail).toContain("CV ini hasil scan dengan teks OCR");
  });
});

describe("hidden text (BR-02)", () => {
  const HIDDEN_METADATA = withHiddenText({
    runCount: 2,
    charCount: 15,
    hasWords: true,
    reasons: ["low-contrast", "tiny-font"],
    samples: [{ text: "React Kubernetes", pageNumber: 2 }],
  });

  it("never scores keywords inside [IGNORED] blocks", () => {
    const hidden = SAMPLE_CV.replace("- Docker", "- Docker\n[IGNORED]React Kubernetes[/IGNORED]").replace(
      "developer dengan",
      "developer [IGNORED]react kubernetes[/IGNORED] dengan",
    );

    expect(analyzeCv(hidden, SAMPLE_JD, CLEAN_METADATA).atsChecks).toEqual(
      analyzeCv(SAMPLE_CV, SAMPLE_JD, CLEAN_METADATA).atsChecks,
    );
  });

  it("asks the user to delete hidden text without changing any score", () => {
    const withHidden = analyzeCv(SAMPLE_CV, SAMPLE_JD, HIDDEN_METADATA);
    const without = analyzeCv(SAMPLE_CV, SAMPLE_JD, CLEAN_METADATA);
    const notice = withHidden.suggestions[0];

    expect(scoresOf(withHidden)).toEqual(scoresOf(without));
    expect(withHidden.overallScore).toBe(without.overallScore);
    expect(notice).toMatchObject({
      id: "hidden-text",
      title: "Hapus teks yang tidak terlihat",
      category: "format",
      priority: "high",
      targetTextSnippet: "React Kubernetes",
      pageNumber: 2,
    });
    expect(notice.description).toContain("warnanya sama atau hampir sama dengan latar, ukurannya 2 pt atau lebih kecil");
    expect(check(withHidden, "formatting").detail).toContain("Ada teks yang tidak terlihat di PDF.");
    expect(without.suggestions.some((suggestion) => suggestion.id === "hidden-text")).toBe(false);
  });

  it("stays silent when hidden text has no letters or digits", () => {
    const report = analyzeCv(
      SAMPLE_CV,
      SAMPLE_JD,
      withHiddenText({ runCount: 2, charCount: 8, reasons: ["low-contrast"] }),
    );

    expect(report.suggestions.some((suggestion) => suggestion.id === "hidden-text")).toBe(false);
    expect(check(report, "formatting").detail).not.toContain("tidak terlihat");
  });

  it("puts the notice first and typography suggestions last", () => {
    const report = analyzeCv(SAMPLE_CV, SAMPLE_JD, {
      ...withTypography({ lineSpacing: 1.6 }),
      hiddenText: HIDDEN_METADATA.hiddenText,
    });

    expect(report.suggestions.map((suggestion) => suggestion.id)).toEqual([
      "hidden-text",
      "sug-01",
      "sug-02",
      "typo-line-spacing",
    ]);
  });

  it("never scores hidden keywords from a real extraction", async () => {
    const lines = [
      "Budi Santoso",
      "budi.santoso@email.com",
      "+6281234567890",
      "Ringkasan",
      "Backend developer dengan 5 tahun pengalaman di Node.js dan TypeScript.",
      "Keahlian",
      "- Node.js",
      "- TypeScript",
      "- SQL",
      "- Docker",
      "Pengalaman",
      "- Backend Developer di PT Maju 2021-2024: meningkatkan performa API sebesar 30%.",
      "- Junior Developer di PT Cepat 2019-2021: membangun REST API untuk 3 produk.",
      "Pendidikan",
      "- S1 Teknik Informatika, Universitas Indonesia 2015-2019",
    ];
    const content = lines.flatMap((line, index) => {
      const y = 740 - index * 16;
      return line === "- Docker"
        ? [textLine(line, 72, y), `q 1 1 1 rg ${textLine("React Kubernetes", 300, y)} Q`]
        : [textLine(line, 72, y)];
    });
    const extraction = await extractPdf(makePdf([content.join("\n")]));
    const fromVisible = analyzeCv(extraction.visibleText, SAMPLE_JD, extraction.metadata);
    const fromSanitized = analyzeCv(extraction.sanitizedText, SAMPLE_JD, extraction.metadata);

    expect(extraction.visibleText).not.toMatch(/react|kubernetes/i);
    expect(extraction.sanitizedText).toContain("- Docker [IGNORED]React Kubernetes[/IGNORED]\nPengalaman");
    expect(fromSanitized.atsChecks).toEqual(fromVisible.atsChecks);
    expect(check(fromVisible, "keyword").detail).toMatch(/react/);
    expect(check(fromVisible, "keyword").detail).toMatch(/kubernetes/);
    expect(fromVisible.suggestions[0]).toMatchObject({
      id: "hidden-text",
      priority: "high",
      targetTextSnippet: "React Kubernetes",
      pageNumber: 1,
    });
  });
});

describe("BR-03 weighted score and BR-04 bands", () => {
  it("weights the checks 40/20/15/10/10/5", () => {
    expect(ATS_CHECK_WEIGHTS).toEqual({ keyword: 40, skills: 20, sections: 15, formatting: 10, quantified: 10, readability: 5 });
    const checks = checksWith({ keyword: 50, skills: 100, sections: 75, formatting: 60, quantified: 40, readability: 100 });
    // (50*40 + 100*20 + 75*15 + 60*10 + 40*10 + 100*5) / 100 = 66.25
    expect(computeWeightedScore(checks)).toBe(66);
  });

  it("rounds half up", () => {
    // (50*40 + 10*5) / 100 = 20.5
    const checks = checksWith({ keyword: 50, skills: 0, sections: 0, formatting: 0, quantified: 0, readability: 10 });
    expect(computeWeightedScore(checks)).toBe(21);
  });

  it("averages over the checks present", () => {
    // (80*40 + 50*20) / 60 = 70
    expect(computeWeightedScore(checksWith({ keyword: 80, skills: 50 }))).toBe(70);
    expect(computeWeightedScore([])).toBe(0);
  });

  it.each([
    ["SAMPLE_CV", SAMPLE_CV, SAMPLE_JD],
    ["STRONG_CV", STRONG_CV, STRONG_JD],
  ])("uses the weighted mean of its own checks for %s", (_label, cv, jd) => {
    const report = analyzeCv(cv, jd, CLEAN_METADATA);
    const expected = Math.round(
      report.atsChecks.reduce((sum, item) => sum + item.score * ATS_CHECK_WEIGHTS[item.id], 0) / 100,
    );
    expect(report.overallScore).toBe(expected);
  });

  it.each([
    [0, "fail"],
    [59, "fail"],
    [60, "warn"],
    [79, "warn"],
    [80, "pass"],
    [100, "pass"],
  ] as const)("gives %i the status %s", (score, status) => {
    expect(statusFor(score)).toBe(status);
  });

  it("derives every status from its score when nothing is N/A", () => {
    for (const item of analyzeCv(SAMPLE_CV, SAMPLE_JD, CLEAN_METADATA).atsChecks) {
      expect(item.status).toBe(statusFor(item.score));
    }
  });
});

describe("typography findings", () => {
  const ids = (metadata: PdfMetadata | null) => deriveTypographyFindings(metadata).suggestions.map((item) => item.id);
  const singleFamily = (family: string) =>
    withTypography({
      fonts: [
        { family, bold: false, italic: false, size: 11, charCount: 100 },
        { family, bold: true, italic: false, size: 16, charCount: 10 },
      ],
      fontFamilies: [family],
    });

  it("flags every typography problem without lowering the score", () => {
    const messy = withTypography({
      fonts: [
        { family: "Arial", bold: false, italic: false, size: 9, charCount: 100 },
        { family: "Times New Roman", bold: false, italic: false, size: 18, charCount: 30 },
      ],
      fontFamilies: ["Arial", "Times New Roman"],
      fontSizes: [9, 18],
      bodySize: 9,
      titleSize: 18,
      lineSpacing: 1.6,
      margins: { left: 40, right: 90, top: 120, bottom: 30 },
      boldRatio: 0.4,
      italicRatio: 0.5,
    });
    const findings = deriveTypographyFindings(messy);
    const messyReport = analyzeCv(SAMPLE_CV, SAMPLE_JD, messy);
    const cleanReport = analyzeCv(SAMPLE_CV, SAMPLE_JD, CLEAN_METADATA);

    expect(findings.suggestions.map((item) => item.id)).toEqual([
      "typo-font-count",
      "typo-font-family",
      "typo-title-size",
      "typo-body-size",
      "typo-line-spacing",
      "typo-margins",
      "typo-bold-overuse",
      "typo-italic-overuse",
      "typo-bold-underuse",
    ]);
    expect(findings.suggestions.filter((item) => item.priority === "medium").map((item) => item.id)).toEqual([
      "typo-bold-overuse",
      "typo-italic-overuse",
    ]);
    expect(findings.summary).toMatch(/^Tipografi: 2 jenis font; /);
    expect(scoresOf(messyReport)).toEqual(scoresOf(cleanReport));
    expect(check(messyReport, "formatting").detail).toContain(findings.summary);
  });

  it("has nothing to say about a clean CV or missing metadata", () => {
    expect(deriveTypographyFindings(CLEAN_METADATA)).toEqual({ suggestions: [], summary: "" });
    expect(deriveTypographyFindings(null)).toEqual({ suggestions: [], summary: "" });
  });

  it("suggests Arial, Calibri, or Helvetica for any other font", () => {
    for (const family of ["Times New Roman", "Comic Sans"]) {
      const suggestions = deriveTypographyFindings(singleFamily(family)).suggestions;

      expect(suggestions.map((item) => item.id)).toEqual(["typo-font-family"]);
      expect(suggestions[0]).toMatchObject({
        title: "Pakai Arial, Calibri, atau Helvetica",
        description: `CV memakai font ${family}. Ganti dengan salah satu dari Arial, Calibri, atau Helvetica.`,
      });
    }
  });

  it("counts width and weight variants as their family", () => {
    for (const family of ["Calibri Light", "Arial Narrow", "Helvetica Neue"]) {
      expect(ids(singleFamily(family))).toEqual([]);
    }
  });

  it("ignores symbol, icon, and unknown fonts", () => {
    const withSymbols = withTypography({
      fonts: [
        { family: "Calibri", bold: false, italic: false, size: 11, charCount: 900 },
        { family: "Calibri", bold: true, italic: false, size: 16, charCount: 12 },
        { family: "Symbol", bold: false, italic: false, size: 11, charCount: 60 },
        { family: "Wingdings", bold: false, italic: false, size: 11, charCount: 30 },
        { family: "Unknown", bold: false, italic: false, size: 11, charCount: 50 },
      ],
      fontFamilies: ["Calibri", "Symbol", "Wingdings", "Unknown"],
    });

    expect(ids(withSymbols)).toEqual([]);
  });

  it("names only the families outside the three", () => {
    const mixed = withTypography({
      fonts: [
        { family: "Calibri", bold: false, italic: false, size: 11, charCount: 800 },
        { family: "Calibri", bold: true, italic: false, size: 16, charCount: 12 },
        { family: "Georgia", bold: false, italic: false, size: 11, charCount: 100 },
      ],
      fontFamilies: ["Calibri", "Georgia"],
    });
    const suggestions = deriveTypographyFindings(mixed).suggestions;

    expect(suggestions.map((item) => item.id)).toEqual(["typo-font-count", "typo-font-family"]);
    expect(suggestions[1].description).toBe("CV memakai font Georgia. Ganti dengan salah satu dari Arial, Calibri, atau Helvetica.");
  });

  it.each([
    [1.05, "rapat"],
    [1.6, "renggang"],
  ])("says line spacing %d is too %s", (lineSpacing, word) => {
    const suggestion = deriveTypographyFindings(withTypography({ lineSpacing })).suggestions[0];

    expect(suggestion).toMatchObject({
      id: "typo-line-spacing",
      description: `Jarak antarbaris CV terlalu ${word}. Atur spasi baris ke 1,0 sampai 1,15 di aplikasi pembuat CV.`,
    });
  });

  it.each([1.1, 1.2, 1.4, 1.45])("accepts measured line spacing %d", (lineSpacing) => {
    expect(ids(withTypography({ lineSpacing }))).toEqual([]);
  });

  it("reads Word's 9.96 pt and 15.96 pt as 10 pt and 16 pt", () => {
    const word = withTypography({
      fonts: [
        { family: "Calibri", bold: false, italic: false, size: 9.96, charCount: 900 },
        { family: "Calibri", bold: true, italic: false, size: 15.96, charCount: 12 },
      ],
      fontFamilies: ["Calibri"],
      fontSizes: [9.96, 15.96],
      bodySize: 9.96,
      titleSize: 15.96,
    });

    expect(ids(word)).toEqual([]);
  });

  it("ignores a font used for a few bullet glyphs", () => {
    const bullets = withTypography({
      fonts: [
        { family: "Calibri", bold: false, italic: false, size: 11, charCount: 7417 },
        { family: "Calibri", bold: true, italic: false, size: 16, charCount: 12 },
        { family: "Arial", bold: false, italic: false, size: 11, charCount: 38 },
      ],
      fontFamilies: ["Calibri", "Arial"],
    });

    expect(ids(bullets)).toEqual([]);
  });

  it("asks for a bold name and headings", () => {
    const plainTitle = withTypography({
      fonts: [
        { family: "Helvetica", bold: false, italic: false, size: 11, charCount: 900 },
        { family: "Helvetica", bold: false, italic: false, size: 16, charCount: 12 },
      ],
    });

    expect(ids(plainTitle)).toEqual(["typo-bold-underuse"]);
  });
});
