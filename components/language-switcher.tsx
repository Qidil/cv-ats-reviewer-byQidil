"use client";

import { usePathname, useRouter } from "next/navigation";
import { useId, type ChangeEvent } from "react";
import { DrawablySelect } from "@/lib/drawably";
import { LANGUAGE_COOKIE, LANGUAGES, isLanguage, type Language } from "@/lib/i18n/language";
import { cn } from "@/lib/cn";
import { useI18n } from "./i18n-provider";

function remember(language: Language) {
  document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * StyleGuide §8.4: a compact dropdown showing only the EN and ID tags. It keeps the saved cookie,
 * the current path, and the lock while an analysis runs; a disabled select cannot take focus, so
 * the reason appears on hover and is wired through aria-describedby for screen readers.
 */
export function LanguageSwitcher({ locked }: { locked: boolean }) {
  const { language: current, t } = useI18n();
  const noteId = useId();
  const pathname = usePathname() || "";
  const router = useRouter();

  const hrefFor = (target: Language) => {
    if (!pathname || pathname === `/${current}`) {
      return `/${target}`;
    }
    if (pathname.startsWith(`/${current}/`)) {
      return `/${target}${pathname.slice(current.length + 1)}`;
    }
    return `/${target}`;
  };

  const change = (event: ChangeEvent<HTMLSelectElement>) => {
    const target = event.target.value;
    if (!isLanguage(target) || target === current) {
      return;
    }
    remember(target);
    router.push(hrefFor(target));
  };

  return (
    // While locked the select is disabled and cannot take focus, so the wrapper itself becomes
    // focusable: focusing it reveals the reason on screen and reads it through aria-describedby.
    <div
      className="group relative"
      role={locked ? "group" : undefined}
      tabIndex={locked ? 0 : undefined}
      aria-describedby={locked ? noteId : undefined}
    >
      <DrawablySelect
        className={cn("w-20", locked && "opacity-60")}
        aria-label={t.header.languageGroup}
        aria-describedby={locked ? noteId : undefined}
        disabled={locked}
        value={current}
        onChange={change}
      >
        {LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {t.languageCodes[language]}
          </option>
        ))}
      </DrawablySelect>
      {locked ? (
        <p
          id={noteId}
          role="tooltip"
          className="pointer-events-none absolute top-full right-0 z-20 mt-2 hidden w-64 border border-subtle bg-white px-3 py-2 text-small text-secondary shadow-md group-hover:block group-focus-within:block"
        >
          {t.header.languageLocked}
        </p>
      ) : null}
    </div>
  );
}
