"use client";

import Link from "next/link";
import { useId } from "react";
import { LANGUAGE_COOKIE, LANGUAGES, type Language } from "@/lib/i18n/language";
import { cn } from "@/lib/cn";
import { useI18n } from "./i18n-provider";

function remember(language: Language) {
  document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * StyleGuide §7.6: two links, each named in its own language. Locked while an analysis runs,
 * because leaving the route would drop it; the locked option stays focusable so the reason
 * shows on focus as well as on hover.
 */
export function LanguageSwitcher({ locked }: { locked: boolean }) {
  const { language: current, t } = useI18n();
  const noteId = useId();
  return (
    <nav aria-label={t.header.languageGroup} className="group relative">
      <ul className="flex rounded-md border border-subtle p-0.5">
        {LANGUAGES.map((language) => {
          const label = (
            <>
              <span aria-hidden className="sm:hidden">
                {t.languageCodes[language]}
              </span>
              <span className="sr-only sm:not-sr-only">{t.languageNames[language]}</span>
            </>
          );
          const base = "flex min-h-11 min-w-11 items-center justify-center rounded px-2.5 text-small font-medium";
          if (language === current) {
            return (
              <li key={language}>
                <span aria-current="true" lang={language} className={cn(base, "bg-surface-elevated text-primary")}>
                  {label}
                </span>
              </li>
            );
          }
          return (
            <li key={language}>
              {locked ? (
                <span
                  role="link"
                  tabIndex={0}
                  aria-disabled="true"
                  aria-describedby={noteId}
                  lang={language}
                  className={cn(base, "cursor-not-allowed text-muted")}
                >
                  {label}
                </span>
              ) : (
                <Link
                  href={`/${language}`}
                  hrefLang={language}
                  lang={language}
                  onClick={() => remember(language)}
                  className={cn(base, "text-secondary hover:bg-surface-elevated hover:text-primary")}
                >
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {locked ? (
        <p
          id={noteId}
          role="tooltip"
          className="pointer-events-none absolute top-full left-0 z-30 mt-2 hidden w-56 max-w-[calc(100vw-5rem)] rounded-md border border-subtle bg-surface-elevated px-3 py-2 text-small text-primary group-focus-within:block group-hover:block"
        >
          {t.header.languageLocked}
        </p>
      ) : null}
    </nav>
  );
}
