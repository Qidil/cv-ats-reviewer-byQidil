import { describe, expect, it } from "vitest";
import { AiParseError, cleanAiText, parseAiReport } from "./parser";

const CHECKS = [
  { id: "keyword", score: 72, detail: "TypeScript dan PostgreSQL ada di CV." },
  { id: "skills", score: 64, detail: "Keahlian wajib terpenuhi sebagian." },
  { id: "sections", score: 100, detail: "Empat bagian standar ada." },
  { id: "formatting", score: 90, detail: "Judul bagian jelas." },
  { id: "quantified", score: 50, detail: "1 dari 2 bullet memuat angka." },
  { id: "readability", score: 85, detail: "Kalimat ringkas." },
];
const SUGGESTION = {
  title: "Tambahkan angka pada pencapaian",
  description: 'Ubah "Menulis dokumentasi teknis" menjadi "Menulis [jumlah] dokumen teknis untuk tim mobile".',
  category: "achievements",
  priority: "high",
  targetTextSnippet: "Menulis dokumentasi teknis",
};
const JOB = {
  title: "Backend Engineer",
  matchScore: 82,
  reason: "Lima tahun membangun layanan pembayaran.",
  keyStrengths: ["TypeScript", "PostgreSQL"],
  missingSkills: ["Kubernetes"],
};
const MODE_A_REPORT = { atsChecks: CHECKS, weaknesses: ["Bullet pengalaman belum memuat angka."], suggestions: [SUGGESTION] };

function reasonOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof AiParseError ? error.reason : "other";
  }
}

describe("parseAiReport extraction", () => {
  it("parses plain JSON", () => {
    const report = parseAiReport(JSON.stringify(MODE_A_REPORT), "mode-a");

    expect(report.checks.keyword).toEqual({ score: 72, detail: "TypeScript dan PostgreSQL ada di CV." });
    expect(Object.keys(report.checks)).toHaveLength(6);
    expect(report.weaknesses).toEqual(["Bullet pengalaman belum memuat angka."]);
    expect(report.suggestions).toEqual([SUGGESTION]);
    expect(report.suggestedJobs).toEqual([]);
  });

  it("reads JSON from a fenced block surrounded by prose", () => {
    const raw = `Berikut hasil analisis saya:\n\`\`\`json\n${JSON.stringify(MODE_A_REPORT)}\n\`\`\`\nSemoga membantu!`;
    expect(parseAiReport(raw, "mode-a").checks.skills?.score).toBe(64);
  });

  it("finds the object inside prose that has its own quotes", () => {
    const raw = `Hasil "akhir": ${JSON.stringify(MODE_A_REPORT)} dengan catatan "penting".`;
    expect(parseAiReport(raw, "mode-a").checks.sections?.score).toBe(100);
  });

  it("repairs trailing commas, single quotes, and the apostrophe patterns models write", () => {
    const trailing = `{"atsChecks": [{"id": "keyword", "score": 70, "detail": "Cukup",},], "weaknesses": [], "suggestions": [],}`;
    const singleQuoted = `{'atsChecks': [{'id': 'skills', 'score': 60, 'detail': 'Sebagian'}]}`;
    const apostrophes = `{"atsChecks": [{"id": "readability','score": 80, "detail": "Ringkas"}]}`;
    // jsonrepair alone turns this into the key `atsChecks":`, so the targeted fix has to come first.
    const openingApostrophe = `{'atsChecks": [{"id": "quantified", "score": 40, "detail": "Sedikit angka"}]}`;

    expect(parseAiReport(trailing, "mode-a").checks.keyword?.score).toBe(70);
    expect(parseAiReport(singleQuoted, "mode-a").checks.skills?.score).toBe(60);
    expect(parseAiReport(apostrophes, "mode-a").checks.readability?.score).toBe(80);
    expect(parseAiReport(openingApostrophe, "mode-a").checks.quantified?.score).toBe(40);
  });

  it("stays fast on output full of unmatched braces", () => {
    const start = performance.now();
    expect(reasonOf(() => parseAiReport(`${"{".repeat(100_000)} tidak ada JSON`, "mode-a"))).not.toBeNull();
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it.each([
    ["empty output", "   ", "empty"],
    ["prose without JSON", "Maaf, saya tidak bisa menilai CV ini.", "no-json"],
    ["JSON without any scored check", JSON.stringify({ atsChecks: [], weaknesses: ["x"] }), "incomplete"],
    ["a cut-off fragment", '{"atsChecks": [{"id": "keyword"', "incomplete"],
  ])("rejects %s as %s", (_label, raw, reason) => {
    expect(reasonOf(() => parseAiReport(raw, "mode-a"))).toBe(reason);
  });
});

describe("cleanAiText (BR-07)", () => {
  it.each([
    ["**Contoh:** Ubah kalimat itu.", "Ubah kalimat itu."],
    ["Tambahkan metrik. Contoh: meningkatkan penjualan.", "Tambahkan metrik. Misalnya, meningkatkan penjualan."],
    ["Pakai istilah seperti contoh : TypeScript.", "Pakai istilah seperti TypeScript."],
    ["Bagian **Keahlian** kurang lengkap.", "Bagian Keahlian kurang lengkap."],
    ["Ringkasan terlalu umum \u2014 sebut bidangnya.", "Ringkasan terlalu umum, sebut bidangnya."],
    ["Periode 2019\u20132021 tetap utuh.", "Periode 2019\u20132021 tetap utuh."],
    ["Contohnya ada di bagian Pengalaman.", "Contohnya ada di bagian Pengalaman."],
  ])("rewrites Indonesian %j", (input, expected) => {
    expect(cleanAiText(input, "id")).toBe(expected);
  });

  it.each([
    ["**Example:** Change the bullet.", "Change the bullet."],
    ["Add a metric. Example: raised sales.", "Add a metric. For example, raised sales."],
    ["Use terms such as examples: TypeScript.", "Use terms such as TypeScript."],
    ["Add a metric. For example: raised sales.", "Add a metric. For example, raised sales."],
    ["The summary is vague \u2014 name the field.", "The summary is vague, name the field."],
    ["The examples in Experience are clear.", "The examples in Experience are clear."],
  ])("rewrites English %j", (input, expected) => {
    expect(cleanAiText(input, "en")).toBe(expected);
  });

  it("cleans every piece of AI prose but keeps the snippet verbatim", () => {
    const report = parseAiReport(
      JSON.stringify({
        atsChecks: [
          { id: "keyword", score: 70, detail: "**Cukup** \u2014 dua istilah hilang." },
          { id: "skills", score: 60, detail: "Sebagian ada." },
        ],
        weaknesses: ["Contoh: bullet tanpa angka."],
        suggestions: [{ ...SUGGESTION, title: "**Tambah angka**", targetTextSnippet: "Tim **inti** \u2014 5 orang" }],
        suggestedJobs: [
          { ...JOB, matchScore: 90, reason: "Contoh: membangun API." },
          ...[80, 70, 60, 50].map((matchScore) => ({ ...JOB, title: `Posisi ${matchScore}`, matchScore })),
        ],
      }),
      "mode-b",
      "id",
    );

    expect(report.checks.keyword?.detail).toBe("Cukup, dua istilah hilang.");
    expect(report.weaknesses).toEqual(["Misalnya, bullet tanpa angka."]);
    expect(report.suggestions[0].title).toBe("Tambah angka");
    expect(report.suggestions[0].targetTextSnippet).toBe("Tim **inti** \u2014 5 orang");
    expect(report.suggestedJobs[0].reason).toBe("Misalnya, membangun API.");
  });

  it("cleans English prose with the English labels", () => {
    const report = parseAiReport(
      JSON.stringify({
        atsChecks: [{ id: "keyword", score: 70, detail: "Example: two terms are missing." }],
        weaknesses: [],
        suggestions: [],
      }),
      "mode-a",
      "en",
    );

    expect(report.checks.keyword?.detail).toBe("For example, two terms are missing.");
  });
});

describe("parseAiReport normalization", () => {
  it("clamps and rounds scores, ignores unknown or repeated ids, and drops checks without a number", () => {
    const report = parseAiReport(
      JSON.stringify({
        atsChecks: [
          { id: "Keyword", score: 104.6, detail: "Lebih" },
          { id: "keyword", score: 10, detail: "Duplikat" },
          { id: "skills", score: "55", detail: "Teks angka" },
          { id: "sections", score: -3, detail: "Negatif" },
          { id: "quantified", score: "banyak", detail: "Bukan angka" },
          { id: "design", score: 90, detail: "Tidak dikenal" },
        ],
      }),
      "mode-a",
    );

    expect(report.checks).toEqual({
      keyword: { score: 100, detail: "Lebih" },
      skills: { score: 55, detail: "Teks angka" },
      sections: { score: 0, detail: "Negatif" },
    });
  });

  it("normalizes categories and priorities, drops incomplete suggestions, and caps lengths and counts", () => {
    const report = parseAiReport(
      JSON.stringify({
        atsChecks: CHECKS,
        weaknesses: Array.from({ length: 10 }, (_, i) => `Kelemahan ${i + 1}`),
        suggestions: [
          { ...SUGGESTION, category: "Keywords", priority: "urgent", targetTextSnippet: "x".repeat(300) },
          { ...SUGGESTION, category: "design" },
          { ...SUGGESTION, title: "" },
          ...Array.from({ length: 12 }, () => SUGGESTION),
        ],
      }),
      "mode-a",
    );

    expect(report.weaknesses).toHaveLength(8);
    expect(report.suggestions).toHaveLength(10);
    expect(report.suggestions[0]).toMatchObject({ category: "keywords", priority: "medium" });
    expect(report.suggestions[0].targetTextSnippet).toHaveLength(200);
    expect(report.suggestions[1].category).toBe("general");
  });

  it("requires the AI's keyword and skills scores and all 5 roles in Mode B (AC-03.1)", () => {
    const fiveJobs = [88, 80, 72, 65, 60].map((matchScore, index) => ({ ...JOB, title: `Role ${index + 1}`, matchScore }));
    const withJobs = { ...MODE_A_REPORT, suggestedJobs: fiveJobs };
    const withoutSkills = { ...withJobs, atsChecks: CHECKS.filter((check) => check.id !== "skills") };
    const fourJobs = { ...withJobs, suggestedJobs: fiveJobs.slice(0, 4) };
    const oneWithoutReason = { ...withJobs, suggestedJobs: fiveJobs.map((job, index) => (index === 2 ? { ...job, reason: " " } : job)) };

    expect(parseAiReport(JSON.stringify(withJobs), "mode-b").suggestedJobs).toEqual(fiveJobs);
    expect(reasonOf(() => parseAiReport(JSON.stringify(MODE_A_REPORT), "mode-b"))).toBe("incomplete");
    expect(reasonOf(() => parseAiReport(JSON.stringify(withoutSkills), "mode-b"))).toBe("incomplete");
    expect(reasonOf(() => parseAiReport(JSON.stringify(fourJobs), "mode-b"))).toBe("incomplete");
    // G-08: a role without a reason cannot explain the fit, so it does not count toward the 5.
    expect(reasonOf(() => parseAiReport(JSON.stringify(oneWithoutReason), "mode-b"))).toBe("incomplete");
  });

  it("keeps the 5 best-matching roles, best first, and drops roles without a title or score", () => {
    const report = parseAiReport(
      JSON.stringify({
        ...MODE_A_REPORT,
        suggestedJobs: [
          { ...JOB, title: "Data Engineer", matchScore: 60 },
          { ...JOB, title: "Backend Engineer", matchScore: 88 },
          { ...JOB, title: "" },
          { ...JOB, title: "Tanpa skor", matchScore: null },
          { ...JOB, title: "QA Engineer", matchScore: 55 },
          { ...JOB, title: "Frontend Engineer", matchScore: 75 },
          { ...JOB, title: "DevOps Engineer", matchScore: 70 },
          { ...JOB, title: "Support Engineer", matchScore: 40 },
          { ...JOB, title: "Platform Engineer", matchScore: 70 },
        ],
      }),
      "mode-b",
    );

    expect(report.suggestedJobs.map((job) => job.title)).toEqual([
      "Backend Engineer",
      "Frontend Engineer",
      "DevOps Engineer",
      "Platform Engineer",
      "Data Engineer",
    ]);
  });
});
