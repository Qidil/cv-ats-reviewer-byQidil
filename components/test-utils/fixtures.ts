import type { AnalyzeResponse } from "@/types/api";
import type { AnalysisMode } from "@/types/ats";

const WEBP = btoa("RIFF....WEBPVP8 ");

/** A trimmed analysis of the fictional "Budi Santoso" CV (3 checks, 2 roles) for component tests. */
export function analyzeResponse(mode: AnalysisMode = "mode-b"): AnalyzeResponse {
  return {
    mode,
    overallScore: 72,
    atsChecks: [
      { id: "keyword", name: "Keyword Match", status: "warn", score: 65, detail: "Two terms from the posting are missing." },
      { id: "sections", name: "Section Completeness", status: "pass", score: 90, detail: "Every core section is present." },
      { id: "quantified", name: "Quantified Achievements", status: "fail", score: 40, detail: "One bullet has a number." },
    ],
    weaknesses: ["Most bullets describe duties instead of results."],
    suggestions: [
      {
        id: "sug-02",
        title: "Tighten the summary",
        description: "Cut the summary to two lines.",
        category: "readability",
        priority: "low",
      },
      {
        id: "sug-01",
        title: "Add a result to the sales bullet",
        description: "Change 'Responsible for sales' to the growth you reached.",
        category: "achievements",
        priority: "high",
        targetTextSnippet: "Responsible for sales",
        pageNumber: 1,
      },
    ],
    suggestedJobs:
      mode === "mode-b"
        ? [
            { title: "Sales Analyst", matchScore: 64, reason: "Sales reporting work.", keyStrengths: ["Excel"], missingSkills: ["SQL"] },
            { title: "Account Manager", matchScore: 82, reason: "Client work.", keyStrengths: ["Negotiation"], missingSkills: [] },
          ]
        : [],
    document: {
      pageCount: 1,
      source: "operator-list",
      pages: [{ pageNumber: 1, box: { x0: 0, y0: 0, x1: 612, y1: 792 }, preview: { width: 1240, height: 1605, webp: WEBP } }],
      previewsOmitted: false,
      runs: [{ pageNumber: 1, x: 72, y: 740, width: 80, fontSize: 11, hidden: false, textStart: 0, textEnd: 12 }],
      runsOmitted: false,
      rawText: "Budi Santoso\nResponsible for sales",
      sanitizedText: "Budi Santoso\nResponsible for sales",
      visibleText: "Budi Santoso\nResponsible for sales",
      hiddenText: { checked: true, runCount: 0, charCount: 0, hasWords: false, reasons: [], samples: [] },
    },
    meta: { modelUsed: "openrouter/free", failoverOccurred: false, continuationOccurred: false, latencyMs: 9800, quota: null },
  };
}

export function pdfFile(name = "cv-budi-santoso.pdf", bytes = 2048): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}
