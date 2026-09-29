"use client";

import Link from "next/link";
import { DrawablyButton } from "@/lib/drawably";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";

export function LandingNavbar() {
  const { language, t } = useI18n();

  return (
    <header className="sticky top-0 z-40 border-b border-subtle bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <Link
            href={`/${language}`}
            className="flex items-center gap-1.5 text-body sm:text-h3 font-bold tracking-tight text-ink transition-opacity hover:opacity-80"
          >
            <span>CV ATS</span>
            <span className="hidden min-[360px]:inline rounded bg-subtle/60 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-secondary">
              Reviewer
            </span>
          </Link>

          <nav aria-label="Main Navigation" className="hidden items-center gap-5 text-small font-medium md:flex">
            <a href="#how-it-works" className="text-secondary transition-colors hover:text-ink">
              {t.landing.navEngine}
            </a>
            <a href="#rubric" className="text-secondary transition-colors hover:text-ink">
              {t.landing.navRubric}
            </a>
            <a href="#privacy" className="text-secondary transition-colors hover:text-ink">
              {t.landing.navPrivacy}
            </a>
            <a href="#faq" className="text-secondary transition-colors hover:text-ink">
              {t.landing.navFaq}
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <LanguageSwitcher locked={false} />
          <Link href={`/${language}/app`} tabIndex={-1} className="shrink-0">
            <DrawablyButton
              variant="solid"
              className="min-h-11 px-2.5 sm:px-4 text-small font-semibold"
            >
              <span className="hidden min-[420px]:inline">{t.landing.ctaOpenApp}</span>
              <span className="min-[420px]:hidden">App</span>
            </DrawablyButton>
          </Link>
        </div>
      </div>
    </header>
  );
}
