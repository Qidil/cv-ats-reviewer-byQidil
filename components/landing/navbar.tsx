"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";
import { DrawablyButton, DrawablyUnderline } from "@/lib/drawably";
import { Dialog } from "@/components/ui/dialog";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/cn";

/**
 * StyleGuide §8.4: one burger button at the top right opens a right-side drawer on every
 * viewport. A section link closes the drawer and lets the anchor scroll to its section.
 */
export function LandingNavbar() {
  const { language, t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  const sections = [
    { href: "#how-it-works", label: t.landing.navEngine },
    { href: "#rubric", label: t.landing.navRubric },
    { href: "#privacy", label: t.landing.navPrivacy },
    { href: "#faq", label: t.landing.navFaq },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-subtle bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href={`/${language}`}
          className="flex min-h-11 items-center gap-2 text-body font-bold tracking-tight text-ink transition-opacity hover:opacity-80 sm:text-h3"
        >
          <BrandLogo className="h-6 sm:h-7" />
          <span>{t.header.appShortName}</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher locked={false} />
          <DrawablyButton
            variant="outline"
            tone="neutral"
            aria-label={t.landing.menu}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="min-h-11 min-w-11 px-2.5"
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden className="size-5" />
          </DrawablyButton>
        </div>
      </div>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title={t.landing.menu} side="end">
        <nav aria-label={t.landing.menu}>
          <ul className="space-y-1">
            {sections.map((section, index) => (
              <li key={section.href} className={index % 2 === 0 ? "tilt-a" : "tilt-d"}>
                <a
                  href={section.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex min-h-12 items-center gap-3 px-2 py-3 text-h3 font-semibold text-ink",
                  )}
                >
                  <DrawablyUnderline>{section.label}</DrawablyUnderline>
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <DrawablyButton
              variant="solid"
              className="min-h-12 w-full px-4 text-body font-semibold"
              onClick={() => {
                setMenuOpen(false);
                router.push(`/${language}/app`);
              }}
            >
              {t.landing.ctaOpenApp}
            </DrawablyButton>
          </div>
        </nav>
      </Dialog>
    </header>
  );
}
