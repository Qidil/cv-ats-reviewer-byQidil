"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { DrawablyButton, DrawablyCard } from "@/lib/drawably";
import { LANGUAGE_COOKIE, LANGUAGES, type Language } from "@/lib/i18n/language";
import { cn } from "@/lib/cn";
import { useI18n } from "./i18n-provider";

function remember(language: Language) {
  document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * StyleGuide §8.4: a compact dropdown showing only the EN and ID tags, with a sketched menu
 * (the native select popup cannot be styled outside Chromium). Keeps the saved cookie, the
 * current path, the lock during an analysis, and full keyboard support.
 */
export function LanguageSwitcher({ locked }: { locked: boolean }) {
  const { language: current, t } = useI18n();
  const noteId = useId();
  const pathname = usePathname() || "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<Partial<Record<Language, HTMLButtonElement | null>>>({});

  const hrefFor = (target: Language) => {
    if (!pathname || pathname === `/${current}`) {
      return `/${target}`;
    }
    if (pathname.startsWith(`/${current}/`)) {
      return `/${target}${pathname.slice(current.length + 1)}`;
    }
    return `/${target}`;
  };

  const choose = (target: Language) => {
    setOpen(false);
    if (locked) {
      return;
    }
    if (target === current) {
      // Re-selecting the current language is a no-op; keep focus on the trigger (gate CR10-03).
      trigger.current?.focus();
      return;
    }
    remember(target);
    router.push(hrefFor(target));
  };

  // A lock that arrives while the menu is open closes it and ignores selections (gate SC10R2-01).
  // Adjusting state during render is the documented pattern for a prop change (React docs).
  const [lockedBefore, setLockedBefore] = useState(locked);
  if (lockedBefore !== locked) {
    setLockedBefore(locked);
    if (locked) {
      setOpen(false);
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    options.current[current]?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, current]);

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    // Anchor on the option that actually has focus, not on the selected language, so the
    // focus cycles EN -> ID -> EN (gate SC10-01 / CR10-01).
    const focusedIndex = LANGUAGES.findIndex((language) => options.current[language] === document.activeElement);
    const index = focusedIndex === -1 ? LANGUAGES.indexOf(current) : focusedIndex;
    const next = event.key === "ArrowDown" ? (index + 1) % LANGUAGES.length : (index + LANGUAGES.length - 1) % LANGUAGES.length;
    options.current[LANGUAGES[next]]?.focus();
  };

  return (
    // While locked the trigger is disabled and cannot take focus, so the wrapper itself becomes
    // focusable: focusing it reveals the reason on screen and reads it through aria-describedby.
    <div
      ref={root}
      className="group relative"
      role={locked ? "group" : undefined}
      tabIndex={locked ? 0 : undefined}
      aria-describedby={locked ? noteId : undefined}
    >
      <DrawablyButton
        ref={trigger}
        variant="outline"
        tone="neutral"
        disabled={locked}
        aria-label={t.header.languageGroup}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn("min-h-11 gap-1 px-2.5 text-small font-medium", locked && "opacity-60")}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden>{t.languageCodes[current]}</span>
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
      </DrawablyButton>
      {open ? (
        <div
          role="listbox"
          aria-label={t.header.languageGroup}
          onKeyDown={moveFocus}
          className="absolute top-full right-0 z-30 mt-2 w-28"
        >
          <DrawablyCard className="bg-white p-1">
            {LANGUAGES.map((language) => (
              <button
                key={language}
                ref={(node) => {
                  options.current[language] = node;
                }}
                type="button"
                role="option"
                aria-selected={language === current}
                onClick={() => choose(language)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-2 px-3 text-small font-medium",
                  language === current ? "text-ink" : "text-secondary",
                )}
              >
                {t.languageCodes[language]}
                {language === current ? <Check aria-hidden className="size-4" /> : null}
              </button>
            ))}
          </DrawablyCard>
        </div>
      ) : null}
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
