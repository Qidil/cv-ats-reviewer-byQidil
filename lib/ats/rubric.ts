import { DEFAULT_LANGUAGE, type Language } from "@/lib/i18n/language";
import type { PdfMetadata } from "@/lib/pdf/types";
import {
  ATS_CHECK_IDS,
  ATS_CHECK_WEIGHTS,
  ATS_STATUS_THRESHOLDS,
  type AtsCheck,
  type AtsCheckId,
  type AtsCheckStatus,
  type Suggestion,
  type SuggestionPriority,
} from "@/types/ats";
import { RUBRIC_TEXT, type RubricSection, type RubricText } from "./rubric-text";
import { stripIgnored } from "./white-text";

export interface DeterministicReport {
  overallScore: number;
  atsChecks: AtsCheck[];
  weaknesses: string[];
  suggestions: Suggestion[];
}

export const CHECK_NAMES: Readonly<Record<Language, Readonly<Record<AtsCheckId, string>>>> = {
  en: RUBRIC_TEXT.en.checkNames,
  id: RUBRIC_TEXT.id.checkNames,
};

type Section = RubricSection;

const SECTIONS: readonly Section[] = ["summary", "experience", "education", "skills"];

const SECTION_HEADINGS: Readonly<Record<Section, readonly string[]>> = {
  summary: [
    "summary", "professional summary", "profile", "professional profile", "about", "about me",
    "objective", "career objective", "ringkasan", "ringkasan profesional", "profil", "profil profesional",
    "tentang", "tentang saya",
  ],
  experience: [
    "experience", "work experience", "professional experience", "employment", "employment history",
    "work history", "pengalaman", "pengalaman kerja", "pengalaman profesional", "riwayat pekerjaan",
    "riwayat kerja",
  ],
  education: [
    "education", "education background", "educational background", "academic background", "pendidikan",
    "riwayat pendidikan", "latar belakang pendidikan", "pendidikan formal",
  ],
  skills: [
    "skills", "skill", "technical skills", "hard skills", "soft skills", "skills & tools", "core competencies",
    "competencies", "keahlian", "kemampuan", "keterampilan", "kompetensi",
  ],
};

/** Other common headings. They only end the section before them. */
const OTHER_HEADINGS: ReadonlySet<string> = new Set([
  "projects", "project", "personal projects", "proyek", "proyek pribadi", "portfolio", "portofolio",
  "organization", "organizations", "organisasi", "pengalaman organisasi", "organizational experience",
  "volunteer", "volunteering", "kegiatan", "kepanitiaan", "leadership", "achievements", "awards",
  "honors", "prestasi", "penghargaan", "certifications", "certification", "certificates", "licenses",
  "sertifikasi", "sertifikat", "training", "courses", "pelatihan", "kursus", "languages", "language",
  "bahasa", "interests", "hobbies", "hobi", "minat", "references", "referensi", "publications",
  "publikasi", "contact", "kontak", "personal information", "informasi pribadi", "data diri",
]);

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
  "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "we", "with",
  "dan", "dari", "di", "kami", "kita", "ke", "pada", "sebagai", "untuk", "yang",
  "adalah", "akan", "telah", "sedang", "agar", "dalam", "tentang", "antara",
  "setelah", "sebelum", "serta", "atau", "juga", "hanya", "semua", "setiap",
  "mencari", "seorang", "dengan", "tim", "kandidat", "memiliki", "membutuhkan",
  "bergabung", "bekerja", "berpengalaman", "minimal", "tahun", "mampu", "dapat",
]);

/** Keyword placement weights, ported from the n8n engine's ATS reference. */
const PLACEMENT_SKILLS = 1.2;
const PLACEMENT_SUMMARY = 1.1;
const SKILL_BONUS_MANY = 5;
const SKILL_BONUS_SOME = 3;
const TABLE_PENALTY = 15;
const TAB_PENALTY = 10;
/** BR-05: a 2-column layout and graphics each cost this much on the formatting check. */
const LAYOUT_PENALTY = 15;
const WORDS_MIN = 50;
const WORDS_MAX = 1200;
const CONCISE_BULLET_WORDS = 25;
const SUGGESTION_SCORE_MAX = 80;
const SUGGESTION_LIMIT = 3;
const MISSING_LIST_LIMIT = 15;
const SNIPPET_MAX_LENGTH = 80;
const TABLE_ROW_PIPES = 2;
const PHONE_MIN_DIGITS = 9;

const TITLE_SIZE_MIN = 14;
const TITLE_SIZE_MAX = 16;
const BODY_SIZE_MIN = 10;
const BODY_SIZE_MAX = 12;
/** Baseline gap over font size: Word's 1.0 to 1.15 spacing measures about 1.12 to 1.40 in Arial, Calibri, and Times. */
const LINE_SPACING_MIN = 1.1;
const LINE_SPACING_MAX = 1.45;
const MARGIN_IDEAL_PT = 72;
const MARGIN_TOLERANCE_PT = 18;
const STYLE_OVERUSE_RATIO = 0.3;
/** Families under this share of characters (a bullet glyph falling back to Arial) are ignored. */
const FAMILY_MIN_SHARE = 0.01;
/** P2-D9. Variants such as "Calibri Light" or "Arial Narrow" count as their family. */
const RECOMMENDED_FONTS: ReadonlySet<string> = new Set(["arial", "calibri", "helvetica"]);
/** Symbol and icon fonts only draw bullets and icons. */
const SYMBOL_FONT = /^(?:symbol|wingdings|webdings|zapf ?dingbats|dingbats|font ?awesome|material icons)/i;

const BULLET_START = /^[-*•·●▪‣○◦■□◆◇►▸➢➤✓✔–»\uF000-\uF0FF]\s*/;
const BULLET_INLINE = /[●•▪‣○◦■◆►➢]/;
const NUMBERED_START = /^\d+[.)]\s+/;
/** Two-word phrases never cross punctuation: "React, TypeScript" is two terms, not one phrase. */
const PHRASE_BREAK = /[,;:!?()[\]{}|/\\•·\n]+|\.(?=\s|$)|\s[-\u2013\u2014]\s/;
/** "2019-2021" has the shape of a phone number, so year ranges are removed before the phone check. */
const YEAR_RANGE = /\b(?:19|20)\d{2}\s*[-/\u2013\u2014]\s*(?:(?:19|20)\d{2}|sekarang|saat ini|present|now)\b/gi;
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{7,}\d/g;

interface CheckContext {
  t: RubricText;
  cv: string;
  cvLower: string;
  jdLower: string;
  /** No job description: keyword and skills matching is left to the AI. */
  modeB: boolean;
  keywords: string[];
  sections: Record<Section, boolean>;
  bullets: string[];
  /** Bullets outside Skills and Education, or every bullet when there are none. */
  achievements: string[];
  skillsText: string;
  summaryText: string;
  wordCount: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHeading(line: string): string {
  return line
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/[*_]+/g, "")
    .replace(/:+$/, "")
    .trim()
    .toLowerCase();
}

function detectSections(cvLower: string): Record<Section, boolean> {
  const found: Record<Section, boolean> = { summary: false, experience: false, education: false, skills: false };
  for (const line of cvLower.split("\n")) {
    const heading = normalizeHeading(line);
    for (const section of SECTIONS) {
      if (!found[section] && SECTION_HEADINGS[section].includes(heading)) {
        found[section] = true;
      }
    }
  }
  return found;
}

function isBulletLine(line: string): boolean {
  return BULLET_START.test(line) || NUMBERED_START.test(line) || BULLET_INLINE.test(line);
}

function extractBullets(cv: string): string[] {
  return cv
    .split("\n")
    .map((line) => line.trim())
    .filter(isBulletLine);
}

/** Skill and education lists are not achievements, so their bullets never count as unquantified. */
function extractAchievementBullets(cv: string): string[] {
  const bullets: string[] = [];
  let section: Section | "other" | null = null;
  for (const line of cv.split("\n")) {
    const heading = normalizeHeading(line);
    const main = SECTIONS.find((candidate) => SECTION_HEADINGS[candidate].includes(heading));
    if (main !== undefined || OTHER_HEADINGS.has(heading)) {
      section = main ?? "other";
      continue;
    }
    const trimmed = line.trim();
    if (section !== "skills" && section !== "education" && isBulletLine(trimmed)) {
      bullets.push(trimmed);
    }
  }
  return bullets;
}

function jdTokens(jdLower: string): string[] {
  return (jdLower.match(/[a-z0-9][a-z0-9+.#-]*/g) ?? []).map((token) => token.replace(/[.]+$/, ""));
}

function isKeywordToken(token: string): boolean {
  return token.length >= 2 && !STOPWORDS.has(token) && !/^\d+$/.test(token);
}

/** JD terms: single tokens plus two-word phrases, so "data visualization" must match as a unit. */
function extractKeywords(jdLower: string): string[] {
  const keywords = new Set(jdTokens(jdLower).filter(isKeywordToken));
  for (const segment of jdLower.split(PHRASE_BREAK)) {
    const tokens = jdTokens(segment);
    for (let i = 0; i < tokens.length - 1; i++) {
      if (isKeywordToken(tokens[i]) && isKeywordToken(tokens[i + 1])) {
        keywords.add(`${tokens[i]} ${tokens[i + 1]}`);
      }
    }
  }
  return [...keywords];
}

function extractSectionText(cv: string, target: Section): string {
  const parts: string[] = [];
  let inSection = false;
  for (const line of cv.split("\n")) {
    const heading = normalizeHeading(line);
    if (inSection) {
      if (SECTIONS.some((section) => section !== target && SECTION_HEADINGS[section].includes(heading))) {
        break;
      }
      parts.push(line.trim());
    } else if (SECTION_HEADINGS[target].includes(heading)) {
      inSection = true;
    }
  }
  return parts.join(" ").toLowerCase();
}

function countSkillItems(skillsText: string): number {
  return skillsText
    .split(/[,\n|•·-]/)
    .map((item) => item.trim().replace(/^[-*•·|]\s*/, ""))
    .filter((item) => item.length >= 2).length;
}

function hasKeyword(text: string, keyword: string): boolean {
  return new RegExp(`(?<![\\w])${escapeRegExp(keyword)}(?![\\w])`).test(text);
}

function pipeCount(line: string): number {
  return (line.match(/\|/g) ?? []).length;
}

/** A table has at least two rows; one line such as "email | phone | city" is a contact line. */
function hasTable(lines: readonly string[]): boolean {
  const rows = lines.map((line) => line.trim()).filter(Boolean);
  return rows.some(
    (row, index) => index > 0 && pipeCount(row) >= TABLE_ROW_PIPES && pipeCount(rows[index - 1]) >= TABLE_ROW_PIPES,
  );
}

function hasPhoneNumber(cv: string): boolean {
  const candidates = cv.replace(YEAR_RANGE, " ").match(PHONE_CANDIDATE) ?? [];
  return candidates.some((candidate) => candidate.replace(/\D/g, "").length >= PHONE_MIN_DIGITS);
}

function formatNumber(value: number, t: RubricText): string {
  return value.toLocaleString(t.numberLocale, { maximumFractionDigits: 2 });
}

function lengthIssue(t: RubricText): string {
  return t.lengthIssue(WORDS_MIN, formatNumber(WORDS_MAX, t));
}

function formatList(items: readonly string[], t: RubricText): string {
  if (items.length <= MISSING_LIST_LIMIT) {
    return items.join(", ");
  }
  return t.moreItems(items.slice(0, MISSING_LIST_LIMIT).join(", "), items.length - MISSING_LIST_LIMIT);
}

export function statusFor(score: number): AtsCheckStatus {
  if (score >= ATS_STATUS_THRESHOLDS.pass) return "pass";
  if (score >= ATS_STATUS_THRESHOLDS.warn) return "warn";
  return "fail";
}

/** BR-03 weighted mean over the checks present. */
export function computeWeightedScore(checks: readonly AtsCheck[]): number {
  const known = checks.filter((check) => check.id in ATS_CHECK_WEIGHTS);
  const totalWeight = known.reduce((sum, check) => sum + ATS_CHECK_WEIGHTS[check.id], 0);
  if (totalWeight === 0) {
    return 0;
  }
  return Math.round(known.reduce((sum, check) => sum + check.score * ATS_CHECK_WEIGHTS[check.id], 0) / totalWeight);
}

function makeCheck(
  ctx: CheckContext,
  id: AtsCheckId,
  score: number,
  detail: string,
  status: AtsCheckStatus = statusFor(score),
): AtsCheck {
  return { id, name: ctx.t.checkNames[id], status, score, detail };
}

function buildContext(cv: string, jd: string, t: RubricText): CheckContext {
  const cvLower = cv.toLowerCase();
  const jdLower = jd.toLowerCase();
  const bullets = extractBullets(cv);
  const achievements = extractAchievementBullets(cv);
  return {
    t,
    cv,
    cvLower,
    jdLower,
    modeB: jdLower.trim() === "",
    keywords: extractKeywords(jdLower),
    sections: detectSections(cvLower),
    bullets,
    achievements: achievements.length > 0 ? achievements : bullets,
    skillsText: extractSectionText(cv, "skills"),
    summaryText: extractSectionText(cv, "summary"),
    wordCount: cv.split(/\s+/).filter(Boolean).length,
  };
}

function checkKeyword(ctx: CheckContext): AtsCheck {
  const text = ctx.t.keyword;
  if (ctx.modeB) {
    return makeCheck(ctx, "keyword", 0, text.withoutJob, "warn");
  }
  if (ctx.keywords.length === 0) {
    return makeCheck(ctx, "keyword", 0, text.jobTooShort, "fail");
  }
  const matched = ctx.keywords.filter((keyword) => hasKeyword(ctx.cvLower, keyword));
  const missing = ctx.keywords.filter((keyword) => !matched.includes(keyword));
  const earned = matched.reduce((sum, keyword) => {
    if (hasKeyword(ctx.skillsText, keyword)) return sum + PLACEMENT_SKILLS;
    if (hasKeyword(ctx.summaryText, keyword)) return sum + PLACEMENT_SUMMARY;
    return sum + 1;
  }, 0);
  const score = Math.min(100, Math.round((earned / (ctx.keywords.length * PLACEMENT_SKILLS)) * 100));
  const detail = missing.length === 0 ? text.allFound(matched.length) : text.missing(formatList(missing, ctx.t));
  return makeCheck(ctx, "keyword", score, detail);
}

function checkSkills(ctx: CheckContext): AtsCheck {
  const text = ctx.t.skills;
  if (ctx.modeB) {
    return makeCheck(ctx, "skills", 0, text.withoutJob, "warn");
  }
  if (!ctx.sections.skills || ctx.skillsText.trim() === "") {
    return makeCheck(ctx, "skills", 0, text.noSection, "fail");
  }
  if (ctx.keywords.length === 0) {
    return makeCheck(ctx, "skills", 0, text.jobTooShort, "fail");
  }
  const matched = ctx.keywords.filter((keyword) => hasKeyword(ctx.skillsText, keyword));
  const missing = ctx.keywords.filter((keyword) => !matched.includes(keyword));
  const items = countSkillItems(ctx.skillsText);
  const bonus = items >= 15 ? SKILL_BONUS_MANY : items >= 10 ? SKILL_BONUS_SOME : 0;
  const score = Math.min(100, Math.round((matched.length / ctx.keywords.length) * 100) + bonus);
  const detail = missing.length === 0 ? text.allFound(matched.length) : text.missing(formatList(missing, ctx.t));
  return makeCheck(ctx, "skills", score, detail);
}

function checkSections(ctx: CheckContext): AtsCheck {
  const missing = SECTIONS.filter((section) => !ctx.sections[section]);
  const score = Math.round(((SECTIONS.length - missing.length) / SECTIONS.length) * 100);
  const detail =
    missing.length === 0
      ? ctx.t.sections.allPresent
      : ctx.t.sections.missing(missing.map((section) => ctx.t.sectionLabels[section]).join(", "));
  return makeCheck(ctx, "sections", score, detail);
}

function checkFormatting(ctx: CheckContext, metadata: PdfMetadata | null, typographySummary: string): AtsCheck {
  const text = ctx.t.formatting;
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(ctx.cv);
  const hasPhone = hasPhoneNumber(ctx.cv);
  const hasBullets = ctx.bullets.length > 0;
  const reasonableLength = ctx.wordCount >= WORDS_MIN && ctx.wordCount <= WORDS_MAX;
  let score = Math.round(([hasEmail, hasPhone, hasBullets, reasonableLength].filter(Boolean).length / 4) * 100);

  const issues: string[] = [];
  if (!hasEmail) issues.push(text.noEmail);
  if (!hasPhone) issues.push(text.noPhone);
  if (!hasBullets) issues.push(text.noBullets);
  if (!reasonableLength) issues.push(lengthIssue(ctx.t));

  const lines = ctx.cv.split("\n");
  if (hasTable(lines)) {
    score = Math.max(0, score - TABLE_PENALTY);
    issues.push(text.table);
  }
  if (lines.filter((line) => line.includes("\t")).length >= 2) {
    score = Math.max(0, score - TAB_PENALTY);
    issues.push(text.tabs);
  }

  const layout = metadata?.layout ?? null;
  if (layout !== null) {
    if (layout.columnCount >= 2) {
      score = Math.max(0, score - LAYOUT_PENALTY);
      issues.push(text.twoColumns);
    }
    if (layout.hasGraphics) {
      score = Math.max(0, score - LAYOUT_PENALTY);
      issues.push(text.graphics(layout.graphics.map((kind) => ctx.t.graphicLabels[kind]).join(", ")));
    }
  }

  const notApplicable = metadata === null || metadata.typography === null || metadata.layout === null;
  const sentences = [issues.length === 0 ? text.ok : ctx.t.needsFixing(issues.join(", "))];
  if (notApplicable) {
    sentences.push(text.typographyUnavailable);
  }
  if (metadata?.hiddenText.hasWords) {
    sentences.push(text.hiddenText);
  }
  if (metadata && !metadata.hiddenText.checked) {
    sentences.push(text.hiddenUnchecked);
  }
  if (layout !== null && layout.ocrPages.length > 0) {
    sentences.push(text.ocr);
  }
  if (typographySummary !== "") {
    sentences.push(typographySummary);
  }
  return makeCheck(ctx, "formatting", score, sentences.join(" "), notApplicable ? "warn" : statusFor(score));
}

function checkQuantified(ctx: CheckContext): AtsCheck {
  if (ctx.achievements.length === 0) {
    return makeCheck(ctx, "quantified", 0, ctx.t.quantified.noBullets);
  }
  const quantified = ctx.achievements.filter((bullet) => /\d/.test(bullet));
  const score = Math.round((quantified.length / ctx.achievements.length) * 100);
  return makeCheck(ctx, "quantified", score, ctx.t.quantified.count(quantified.length, ctx.achievements.length));
}

function checkReadability(ctx: CheckContext): AtsCheck {
  const hasSummary = ctx.sections.summary;
  const hasBullets = ctx.bullets.length > 0;
  const averageBulletWords =
    ctx.bullets.length === 0
      ? 0
      : ctx.bullets.reduce((sum, bullet) => sum + bullet.split(/\s+/).filter(Boolean).length, 0) / ctx.bullets.length;
  const conciseBullets = averageBulletWords <= CONCISE_BULLET_WORDS;
  const reasonableLength = ctx.wordCount >= WORDS_MIN && ctx.wordCount <= WORDS_MAX;
  const score = Math.round(([hasSummary, hasBullets, conciseBullets, reasonableLength].filter(Boolean).length / 4) * 100);

  const issues: string[] = [];
  if (!hasSummary) issues.push(ctx.t.readability.noSummary);
  if (!hasBullets) issues.push(ctx.t.formatting.noBullets);
  if (!conciseBullets) issues.push(ctx.t.readability.longBullets);
  if (!reasonableLength) issues.push(lengthIssue(ctx.t));
  const detail = issues.length === 0 ? ctx.t.readability.ok : ctx.t.needsFixing(issues.join(", "));
  return makeCheck(ctx, "readability", score, detail);
}

function priorityFor(score: number): SuggestionPriority {
  if (score < 40) return "high";
  if (score < 60) return "medium";
  return "low";
}

function snippet(text: string): string {
  return text.replace(BULLET_START, "").replace(NUMBERED_START, "").slice(0, SNIPPET_MAX_LENGTH).trim();
}

function checkSuggestion(check: AtsCheck, ctx: CheckContext): Omit<Suggestion, "id"> {
  const priority = priorityFor(check.score);
  const text = ctx.t.suggestions;
  switch (check.id) {
    case "keyword":
      return { title: text.keyword.title, description: text.keyword.description(check.detail), category: "keywords", priority };
    case "skills":
      return { title: text.skills.title, description: text.skills.description(check.detail), category: "skills", priority };
    case "sections":
      return { title: text.sections.title, description: text.sections.description(check.detail), category: "structure", priority };
    case "formatting":
      return { title: text.formatting.title, description: text.formatting.description(check.detail), category: "format", priority };
    case "quantified": {
      const plain = ctx.achievements.find((bullet) => !/\d/.test(bullet));
      if (plain === undefined) {
        return { title: text.quantified.title, description: text.quantified.general, category: "achievements", priority };
      }
      const quote = snippet(plain);
      return {
        title: text.quantified.title,
        description: text.quantified.quote(quote),
        category: "achievements",
        priority,
        targetTextSnippet: quote,
      };
    }
    case "readability":
      return {
        title: text.readability.title,
        description: text.readability.description(check.detail),
        category: "readability",
        priority,
      };
  }
}

/** BR-02: hidden text never changes a score; the user is asked to delete it. */
function hiddenTextSuggestion(metadata: PdfMetadata | null, t: RubricText): Suggestion | null {
  const hidden = metadata?.hiddenText;
  if (!hidden?.hasWords) {
    return null;
  }
  const phrases = [...new Set(hidden.reasons.map((reason) => t.hidden.reasons[reason]))];
  const first = hidden.samples[0];
  return {
    id: "hidden-text",
    title: t.hidden.title,
    description: t.hidden.description(phrases.join(", ")),
    category: "format",
    priority: "high",
    ...(first ? { targetTextSnippet: first.text, pageNumber: first.pageNumber } : {}),
  };
}

export interface TypographyFindings {
  suggestions: Suggestion[];
  summary: string;
}

/** Typography never lowers a score; it only produces suggestions and a formatting note. */
export function deriveTypographyFindings(
  metadata: PdfMetadata | null,
  language: Language = DEFAULT_LANGUAGE,
): TypographyFindings {
  const typography = metadata?.typography;
  if (!typography) {
    return { suggestions: [], summary: "" };
  }
  const t = RUBRIC_TEXT[language];
  const text = t.typography;
  const number = (value: number) => formatNumber(value, t);
  const suggestions: Suggestion[] = [];
  const notes: string[] = [];
  const add = (id: string, title: string, description: string, note: string, priority: SuggestionPriority = "low") => {
    suggestions.push({ id, title, description, category: "format", priority });
    notes.push(note);
  };
  // Word writes 10 pt and 16 pt as 9.96 pt and 15.96 pt.
  const roundHalf = (value: number) => Math.round(value * 2) / 2;

  const totalChars = typography.fonts.reduce((sum, font) => sum + font.charCount, 0);
  const familyChars = new Map<string, number>();
  for (const font of typography.fonts) {
    familyChars.set(font.family, (familyChars.get(font.family) ?? 0) + font.charCount);
  }
  const families = [...familyChars.entries()]
    .filter(
      ([family, count]) =>
        family !== "Unknown" &&
        !SYMBOL_FONT.test(family) &&
        (totalChars === 0 || count / totalChars >= FAMILY_MIN_SHARE),
    )
    .map(([family]) => family);
  const outsideRecommended = families.filter(
    (family) => !RECOMMENDED_FONTS.has(family.trim().split(/\s+/)[0].toLowerCase()),
  );
  const title = typography.titleSize === null ? null : roundHalf(typography.titleSize);
  const body = typography.bodySize === null ? null : roundHalf(typography.bodySize);

  if (families.length > 1) {
    add(
      "typo-font-count",
      text.fontCount.title,
      text.fontCount.description(families.length, families.join(", ")),
      text.fontCount.note(families.length),
    );
  }
  if (outsideRecommended.length > 0) {
    const fonts = outsideRecommended.join(", ");
    add("typo-font-family", text.fontFamily.title, text.fontFamily.description(fonts), text.fontFamily.note(fonts));
  }
  if (title !== null && (title < TITLE_SIZE_MIN || title > TITLE_SIZE_MAX)) {
    add(
      "typo-title-size",
      text.titleSize.title,
      text.titleSize.description(number(title)),
      text.titleSize.note(number(title)),
    );
  }
  if (body !== null && (body < BODY_SIZE_MIN || body > BODY_SIZE_MAX)) {
    add("typo-body-size", text.bodySize.title, text.bodySize.description(number(body)), text.bodySize.note(number(body)));
  }
  if (
    typography.lineSpacing !== null &&
    (typography.lineSpacing < LINE_SPACING_MIN || typography.lineSpacing > LINE_SPACING_MAX)
  ) {
    const spacing = typography.lineSpacing < LINE_SPACING_MIN ? text.lineSpacing.tight : text.lineSpacing.loose;
    add(
      "typo-line-spacing",
      text.lineSpacing.title,
      text.lineSpacing.description(spacing),
      text.lineSpacing.note(spacing),
    );
  }
  if (typography.margins !== null) {
    const { left, right, top, bottom } = typography.margins;
    const ideal = (value: number) => Math.abs(value - MARGIN_IDEAL_PT) <= MARGIN_TOLERANCE_PT;
    if (![left, right, top, bottom].every(ideal)) {
      add(
        "typo-margins",
        text.margins.title,
        text.margins.description(number(left), number(right), number(top), number(bottom)),
        text.margins.note,
      );
    }
  }
  if (typography.boldRatio !== null && typography.boldRatio > STYLE_OVERUSE_RATIO) {
    const percent = Math.round(typography.boldRatio * 100);
    add(
      "typo-bold-overuse",
      text.boldOveruse.title,
      text.boldOveruse.description(percent),
      text.boldOveruse.note(percent),
      "medium",
    );
  }
  if (typography.italicRatio !== null && typography.italicRatio > STYLE_OVERUSE_RATIO) {
    const percent = Math.round(typography.italicRatio * 100);
    add(
      "typo-italic-overuse",
      text.italicOveruse.title,
      text.italicOveruse.description(percent),
      text.italicOveruse.note(percent),
      "medium",
    );
  }
  if (
    typography.titleSize !== null &&
    typography.titleSize !== typography.bodySize &&
    !typography.fonts.some((font) => font.size === typography.titleSize && font.bold)
  ) {
    add("typo-bold-underuse", text.boldUnderuse.title, text.boldUnderuse.description, text.boldUnderuse.note);
  }
  return { suggestions, summary: notes.length > 0 ? text.summary(notes.join("; ")) : "" };
}

/**
 * Deterministic side of the report (BR-03 to BR-05), written in the requested language (BR-13).
 * Hidden text is stripped first, so it can never earn keyword points.
 */
export function analyzeCv(
  cvText: string,
  targetJobDescription: string,
  metadata: PdfMetadata | null = null,
  language: Language = DEFAULT_LANGUAGE,
): DeterministicReport {
  const t = RUBRIC_TEXT[language];
  const ctx = buildContext(stripIgnored(cvText), targetJobDescription, t);
  const typography = deriveTypographyFindings(metadata, language);
  const checks: Record<AtsCheckId, AtsCheck> = {
    keyword: checkKeyword(ctx),
    skills: checkSkills(ctx),
    sections: checkSections(ctx),
    formatting: checkFormatting(ctx, metadata, typography.summary),
    quantified: checkQuantified(ctx),
    readability: checkReadability(ctx),
  };
  const atsChecks = ATS_CHECK_IDS.map((id) => checks[id]);
  // Mode B leaves keyword and skills to the AI, so they are neither weaknesses nor suggestions here.
  const weak = atsChecks.filter(
    (check) => !(ctx.modeB && (check.id === "keyword" || check.id === "skills")) && check.score < SUGGESTION_SCORE_MAX,
  );

  const checkSuggestions: Suggestion[] = [...weak]
    .sort((a, b) => a.score - b.score)
    .slice(0, SUGGESTION_LIMIT)
    .map((check, index) => ({ id: `sug-${String(index + 1).padStart(2, "0")}`, ...checkSuggestion(check, ctx) }));
  const hidden = hiddenTextSuggestion(metadata, t);

  return {
    overallScore: computeWeightedScore(atsChecks),
    atsChecks,
    weaknesses: weak.map((check) => `${check.name}: ${check.score}/100. ${check.detail}`),
    suggestions: [...(hidden ? [hidden] : []), ...checkSuggestions, ...typography.suggestions],
  };
}
