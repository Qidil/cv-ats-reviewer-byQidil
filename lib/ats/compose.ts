import type { AiReport } from "@/lib/ai/parser";
import type { PdfExtraction } from "@/lib/pdf/types";
import { ATS_CHECK_IDS, type AnalysisMode, type AtsCheck, type SuggestedJob, type Suggestion } from "@/types/ats";
import { computeWeightedScore, statusFor, type DeterministicReport } from "./rubric";

export interface ComposeInput {
  mode: AnalysisMode;
  deterministic: DeterministicReport;
  ai: AiReport;
  extraction: PdfExtraction;
}

export interface ComposedReport {
  overallScore: number;
  atsChecks: AtsCheck[];
  weaknesses: string[];
  suggestions: Suggestion[];
  suggestedJobs: SuggestedJob[];
}

const EDGE_QUOTES = /^["'\u201c\u201d\u2018\u2019\u00ab\u00bb]+|["'\u201c\u201d\u2018\u2019\u00ab\u00bb]+$/g;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface LocatedSnippet {
  text: string;
  pageNumber?: number;
}

/**
 * T5: a snippet is kept only when it appears in the text the AI saw (whitespace-insensitive);
 * its page comes from the rawText span of each page's runs.
 */
export function createSnippetLocator(extraction: PdfExtraction): (snippet: string) => LocatedSnippet | null {
  const visible = collapse(extraction.visibleText);
  const spans = new Map<number, { start: number; end: number }>();
  for (const run of extraction.runs) {
    const span = spans.get(run.pageNumber);
    spans.set(
      run.pageNumber,
      span === undefined
        ? { start: run.textStart, end: run.textEnd }
        : { start: Math.min(span.start, run.textStart), end: Math.max(span.end, run.textEnd) },
    );
  }
  const pages = [...spans.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pageNumber, span]) => ({ pageNumber, text: collapse(extraction.rawText.slice(span.start, span.end)) }));

  return (snippet) => {
    const needle = collapse(snippet.trim().replace(EDGE_QUOTES, ""));
    if (needle === "" || !visible.includes(needle)) {
      return null;
    }
    const page = pages.find((candidate) => candidate.text.includes(needle));
    return page === undefined ? { text: needle } : { text: needle, pageNumber: page.pageNumber };
  };
}

function withSnippet(
  suggestion: Pick<Suggestion, "id" | "title" | "description" | "category" | "priority">,
  snippet: string | undefined,
  locate: (snippet: string) => LocatedSnippet | null,
): Suggestion {
  const base: Suggestion = {
    id: suggestion.id,
    title: suggestion.title,
    description: suggestion.description,
    category: suggestion.category,
    priority: suggestion.priority,
  };
  const located = snippet === undefined || snippet === "" ? null : locate(snippet);
  if (located === null) {
    return base;
  }
  return {
    ...base,
    targetTextSnippet: located.text,
    ...(located.pageNumber === undefined ? {} : { pageNumber: located.pageNumber }),
  };
}

/**
 * P3-D5(a), the same for every mode: the AI's scores except formatting, which stays deterministic
 * (BR-05); statuses from BR-04; the overall score is the BR-03 weighted sum of the merged checks.
 */
export function composeReport(input: ComposeInput): ComposedReport {
  const deterministicChecks = new Map(input.deterministic.atsChecks.map((check) => [check.id, check]));
  const atsChecks = ATS_CHECK_IDS.map((id): AtsCheck => {
    const fallback = deterministicChecks.get(id);
    if (fallback === undefined) {
      throw new Error(`Deterministic report is missing the ${id} check`);
    }
    const aiCheck = id === "formatting" ? undefined : input.ai.checks[id];
    if (aiCheck === undefined || aiCheck.detail === "") {
      return fallback;
    }
    // The rubric already named the check in the response language.
    return { id, name: fallback.name, status: statusFor(aiCheck.score), score: aiCheck.score, detail: aiCheck.detail };
  });

  const locate = createSnippetLocator(input.extraction);
  const deterministicSuggestions = input.deterministic.suggestions;
  const aiSuggestions = input.ai.suggestions.map((suggestion, index) =>
    withSnippet(
      { ...suggestion, id: `sug-${String(index + 1).padStart(2, "0")}` },
      suggestion.targetTextSnippet,
      locate,
    ),
  );
  const checkSuggestions =
    aiSuggestions.length > 0
      ? aiSuggestions
      : deterministicSuggestions
          .filter((suggestion) => suggestion.id.startsWith("sug-"))
          .map((suggestion) => withSnippet(suggestion, suggestion.targetTextSnippet, locate));

  return {
    overallScore: computeWeightedScore(atsChecks),
    atsChecks,
    weaknesses: input.ai.weaknesses.length > 0 ? input.ai.weaknesses : input.deterministic.weaknesses,
    suggestions: [
      ...deterministicSuggestions.filter((suggestion) => suggestion.id === "hidden-text"),
      ...checkSuggestions,
      ...deterministicSuggestions.filter((suggestion) => suggestion.id.startsWith("typo-")),
    ],
    suggestedJobs: input.mode === "mode-b" ? input.ai.suggestedJobs : [],
  };
}
