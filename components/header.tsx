"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, Home, KeyRound, Settings } from "lucide-react";
import { Button } from "./ui/button";
import { useI18n } from "./i18n-provider";
import { LanguageSwitcher } from "./language-switcher";

export function Header({
  languageLocked,
  usingOwnKey,
  onOpenHistory,
  onOpenSettings,
}: {
  languageLocked: boolean;
  usingOwnKey: boolean;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}) {
  const { language, t } = useI18n();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 border-b border-subtle bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link
            href={`/${language}`}
            className="font-semibold whitespace-nowrap text-ink transition-opacity hover:opacity-80"
          >
            <span aria-hidden className="min-[380px]:hidden">
              {t.header.appShortName}
            </span>
            <span className="sr-only min-[380px]:not-sr-only">{t.header.appName}</span>
          </Link>
          <LanguageSwitcher locked={languageLocked} />
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 hidden items-center gap-1.5 text-small font-medium text-emerald-700 md:inline-flex">
            <KeyRound aria-hidden className="size-4" />
            {usingOwnKey ? t.header.ownKey : t.header.freeQuota}
          </span>
          {/* Phase 10: same sketched icon-button style as History and Settings. */}
          <Button
            variant="icon"
            className="sm:px-3"
            aria-label={t.actions.mainPage}
            onClick={() => router.push(`/${language}`)}
          >
            <Home aria-hidden className="size-5" />
            <span aria-hidden className="hidden sm:inline">
              {t.actions.mainPage}
            </span>
          </Button>
          <Button variant="icon" className="sm:px-3" aria-label={t.header.history} onClick={onOpenHistory}>
            <History aria-hidden className="size-5" />
            <span aria-hidden className="hidden sm:inline">
              {t.header.history}
            </span>
          </Button>
          <Button variant="icon" className="sm:px-3" aria-label={t.header.settings} onClick={onOpenSettings}>
            <Settings aria-hidden className="size-5" />
            <span aria-hidden className="hidden sm:inline">
              {t.header.settings}
            </span>
          </Button>
        </div>
      </div>
    </header>
  );
}
