import { jsonrepair } from "jsonrepair";
import { DEFAULT_LANGUAGE, type Language } from "@/lib/i18n/language";
import {
  ATS_CHECK_IDS,
  SUGGESTED_JOB_COUNT,
  type AnalysisMode,
  type AtsCheckId,
  type SuggestedJob,
  type SuggestionPriority,
} from "@/types/ats";
import { SUGGESTION_CATEGORIES } from "./prompts";

export interface AiCheck {
  score: number;
  detail: string;
}

export interface AiSuggestion {
  title: string;
  description: string;
  category: string;
  priority: SuggestionPriority;
  /** Empty when the suggestion does not point at a passage. */
  targetTextSnippet: string;
}

export interface AiReport {
  checks: Partial<Record<AtsCheckId, AiCheck>>;
  weaknesses: string[];
  suggestions: AiSuggestion[];
  suggestedJobs: SuggestedJob[];
}

export type AiParseFailure = "empty" | "no-json" | "incomplete";

export class AiParseError extends Error {
  readonly reason: AiParseFailure;

  constructor(reason: AiParseFailure) {
    super(`AI output rejected: ${reason}`);
    this.name = "AiParseError";
    this.reason = reason;
  }
}

/** Model output is capped by max_tokens, far below this; the cap bounds the repair work on garbage. */
const MAX_RAW_LENGTH = 200_000;
const LIMITS = {
  detail: 600,
  weakness: 300,
  weaknesses: 8,
  title: 120,
  description: 800,
  snippet: 200,
  suggestions: 10,
  reason: 400,
  listItem: 120,
  listItems: 5,
} as const;
const AI_SCORED_CHECKS: readonly AtsCheckId[] = ["keyword", "skills", "sections", "quantified", "readability"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max).trim() : "";
}

/** Label words the prompts forbid, with the plain sentence starts that replace them and the words that already introduce an example. */
const EXAMPLE_LABELS: Readonly<
  Record<Language, { pattern: RegExp; sentenceStart: string; inline: string; introducedBy: RegExp }>
> = {
  en: {
    pattern: /\b(?:for\s+)?examples?\s*:\s*/gi,
    sentenceStart: "For example, ",
    inline: "for example, ",
    introducedBy: /\b(?:such as|like|including)$/i,
  },
  id: {
    pattern: /\bcontoh\s*:\s*/gi,
    sentenceStart: "Misalnya, ",
    inline: "misalnya, ",
    introducedBy: /\b(?:seperti|misalnya|yaitu|termasuk)$/i,
  },
};

/**
 * BR-07: free models do not always follow the prompt's style rules, so labels, markdown emphasis,
 * and em dashes are removed before the text reaches the user.
 */
export function cleanAiText(text: string, language: Language = DEFAULT_LANGUAGE): string {
  const label = EXAMPLE_LABELS[language];
  return text
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/\*\*|__/g, "")
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(label.pattern, (match: string, offset: number, whole: string) => {
      const before = whole.slice(0, offset).trimEnd();
      // G-20: before a whole sentence, or after words that already introduce the example, a label only breaks the grammar.
      if (/^\p{Lu}/u.test(whole.slice(offset + match.length)) || label.introducedBy.test(before)) {
        return "";
      }
      return before === "" || /[.!?:]$/.test(before) ? label.sentenceStart : label.inline;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** AI prose shown to the user. Snippets use clip() alone, because they must stay verbatim. */
function prose(value: unknown, max: number, language: Language): string {
  return typeof value === "string" ? clip(cleanAiText(value, language), max) : "";
}

function toScore(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? Math.round(Math.min(100, Math.max(0, parsed))) : null;
}

function toStrings(value: unknown, maxItems: number, maxLength: number, language: Language): string[] {
  return asList(value)
    .map((item) => prose(item, maxLength, language))
    .filter(Boolean)
    .slice(0, maxItems);
}

function isCheckId(value: string): value is AtsCheckId {
  return (ATS_CHECK_IDS as readonly string[]).includes(value);
}

function toChecks(value: unknown, language: Language): Partial<Record<AtsCheckId, AiCheck>> {
  const checks: Partial<Record<AtsCheckId, AiCheck>> = {};
  for (const item of asList(value)) {
    const entry = asRecord(item);
    const id = typeof entry?.id === "string" ? entry.id.trim().toLowerCase() : "";
    const score = toScore(entry?.score);
    if (entry && isCheckId(id) && score !== null && checks[id] === undefined) {
      checks[id] = { score, detail: prose(entry.detail, LIMITS.detail, language) };
    }
  }
  return checks;
}

function toPriority(value: unknown): SuggestionPriority {
  return value === "high" || value === "low" ? value : "medium";
}

function toCategory(value: unknown): string {
  const category = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (SUGGESTION_CATEGORIES as readonly string[]).includes(category) ? category : "general";
}

function toSuggestions(value: unknown, language: Language): AiSuggestion[] {
  const suggestions: AiSuggestion[] = [];
  for (const item of asList(value)) {
    const entry = asRecord(item);
    const title = prose(entry?.title, LIMITS.title, language);
    const description = prose(entry?.description, LIMITS.description, language);
    if (entry && title !== "" && description !== "") {
      suggestions.push({
        title,
        description,
        category: toCategory(entry.category),
        priority: toPriority(entry.priority),
        targetTextSnippet: clip(entry.targetTextSnippet, LIMITS.snippet),
      });
    }
  }
  return suggestions.slice(0, LIMITS.suggestions);
}

function toJobs(value: unknown, language: Language): SuggestedJob[] {
  const jobs: SuggestedJob[] = [];
  for (const item of asList(value)) {
    const entry = asRecord(item);
    const title = prose(entry?.title, LIMITS.title, language);
    const matchScore = toScore(entry?.matchScore);
    const reason = prose(entry?.reason, LIMITS.reason, language);
    // AC-03.1: a role without a reason cannot explain the fit, so it does not count (G-08).
    if (entry && title !== "" && matchScore !== null && reason !== "") {
      jobs.push({
        title,
        matchScore,
        reason,
        keyStrengths: toStrings(entry.keyStrengths, LIMITS.listItems, LIMITS.listItem, language),
        missingSkills: toStrings(entry.missingSkills, LIMITS.listItems, LIMITS.listItem, language),
      });
    }
  }
  // Array.sort is stable, so equal scores keep the model's own order.
  return jobs.sort((a, b) => b.matchScore - a.matchScore).slice(0, SUGGESTED_JOB_COUNT);
}

function normalize(parsed: Record<string, unknown>, language: Language): AiReport {
  return {
    checks: toChecks(parsed.atsChecks, language),
    weaknesses: toStrings(parsed.weaknesses, LIMITS.weaknesses, LIMITS.weakness, language),
    suggestions: toSuggestions(parsed.suggestions, language),
    suggestedJobs: toJobs(parsed.suggestedJobs, language),
  };
}

/**
 * Mode A falls back to the rubric for missing checks. Mode B needs the AI's keyword and skills scores
 * and all 5 roles, each with a reason (AC-03.1); a shorter list goes back to the chain like unreadable output.
 */
function isComplete(report: AiReport, mode: AnalysisMode): boolean {
  if (mode === "mode-b") {
    return (
      report.checks.keyword !== undefined &&
      report.checks.skills !== undefined &&
      report.suggestedJobs.length === SUGGESTED_JOB_COUNT
    );
  }
  return AI_SCORED_CHECKS.some((id) => report.checks[id] !== undefined);
}

function extractFenced(raw: string): string | null {
  return raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? null;
}

/** One pass over the text; quotes outside an object are prose, so they do not start a string. */
function topLevelObjects(raw: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = depth > 0;
    } else if (char === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (char === "}" && depth > 0) {
      depth--;
      if (depth === 0) objects.push(raw.slice(start, i + 1));
    }
  }
  return objects;
}

function parseObject(candidate: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(candidate));
  } catch {
    return null;
  }
}

/**
 * Models write JSON that is almost valid. Two apostrophe patterns are fixed before jsonrepair,
 * which otherwise turns `{'key":` into a wrong key; every variant is tried until one is complete.
 */
function* parsedVariants(text: string): Generator<Record<string, unknown>> {
  const targeted = text.replace(/','/g, '","').replace(/\{'/g, '{"');
  const attempts = [() => text, ...(targeted === text ? [] : [() => targeted]), () => jsonrepair(text)];
  if (targeted !== text) {
    attempts.push(() => jsonrepair(targeted));
  }
  for (const attempt of attempts) {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = parseObject(attempt());
    } catch {
      // jsonrepair throws on text it cannot repair; the next variant may still work.
    }
    if (parsed !== null) {
      yield parsed;
    }
  }
}

export function parseAiReport(raw: string, mode: AnalysisMode, language: Language = DEFAULT_LANGUAGE): AiReport {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new AiParseError("empty");
  }
  const text = raw.length > MAX_RAW_LENGTH ? raw.slice(0, MAX_RAW_LENGTH) : raw;
  const fenced = extractFenced(text);
  const candidates = [...(fenced === null ? [] : [fenced]), text, ...topLevelObjects(text)];
  let parsedAny = false;
  for (const candidate of candidates) {
    for (const parsed of parsedVariants(candidate)) {
      parsedAny = true;
      const report = normalize(parsed, language);
      if (isComplete(report, mode)) {
        return report;
      }
    }
  }
  throw new AiParseError(parsedAny ? "incomplete" : "no-json");
}
