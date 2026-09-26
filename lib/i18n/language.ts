export const LANGUAGES = ["en", "id"] as const;

export type Language = (typeof LANGUAGES)[number];

/** FEAT-11: a first visit, and any request without a supported language, gets English. */
export const DEFAULT_LANGUAGE: Language = "en";

/** Written by the language switcher, read by proxy.ts to send "/" to the last choice (ADR-008). */
export const LANGUAGE_COOKIE = "lang";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * BR-13: the highest-ranked supported language of an Accept-Language header such as
 * "id-ID,id;q=0.9,en;q=0.8", or English when none is supported.
 */
export function negotiateLanguage(header: string | null | undefined): Language {
  if (!header) {
    return DEFAULT_LANGUAGE;
  }
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const qParam = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      return { language: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.q > 0 && isLanguage(entry.language))
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const best = ranked[0]?.language;
  return isLanguage(best) ? best : DEFAULT_LANGUAGE;
}
