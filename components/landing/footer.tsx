"use client";

import Link from "next/link";
import { DrawablyButton, DrawablyDivider } from "@/lib/drawably";
import { INK } from "@/lib/drawably/inks";
import { useI18n } from "@/components/i18n-provider";

export function LandingFooter() {
  const { language, t } = useI18n();

  return (
    <footer className="bg-white px-4 pb-12 sm:px-6">
      <DrawablyDivider className="mx-auto mb-10 max-w-6xl" />
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-body font-bold text-ink">CV ATS Reviewer</span>
            <span className="rounded bg-subtle px-1.5 py-0.5 text-xs font-semibold text-secondary">
              v0.1.0
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {t.landing.footer.tagline}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-secondary">
          <Link href={`/${language}/app`} tabIndex={-1}>
            <DrawablyButton variant="scribble" stroke={INK.teal} className="min-h-11 px-4 text-small font-medium text-ink">
              {t.landing.footer.openApp}
            </DrawablyButton>
          </Link>
          <a
            href="https://github.com/Qidil/cv-ats-reviewer-byQidil"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink"
          >
            {t.landing.footer.sourceCode}
          </a>
        </div>

        <p className="text-xs text-muted">
          {t.landing.footer.rights}
        </p>
      </div>
    </footer>
  );
}
