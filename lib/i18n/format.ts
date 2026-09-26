import type { Language } from "./language";

const LOCALES: Readonly<Record<Language, string>> = { en: "en-US", id: "id-ID" };

/** Fills `{name}` placeholders; dictionaries stay plain strings so they can travel to the browser. */
export function fillTemplate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** DELTA-50: reset and retry times are shown in the zone the quota day runs on. */
const QUOTA_TIME_ZONE = "Asia/Makassar";

/**
 * StyleGuide §7.4/§7.5: a reset or retry time on the 24-hour clock in GMT+8, written the way each
 * language writes clock times ("00:00" / "00.00"). The zone label comes from the dictionary template.
 */
export function formatQuotaTime(iso: string, language: Language, template: string): string {
  const time = new Intl.DateTimeFormat(LOCALES[language], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: QUOTA_TIME_ZONE,
  }).format(new Date(iso));
  return fillTemplate(template, { time });
}

export function formatDateTime(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatFileSize(bytes: number, language: Language): string {
  const number = (value: number) => new Intl.NumberFormat(LOCALES[language], { maximumFractionDigits: 1 }).format(value);
  if (bytes >= 1024 * 1024) {
    return `${number(bytes / (1024 * 1024))} MB`;
  }
  return `${number(Math.max(1, Math.round(bytes / 1024)))} KB`;
}
