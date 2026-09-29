"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  DrawablyArrow,
  DrawablyBadge,
  DrawablyButton,
  DrawablyCard,
} from "@/lib/drawably";
import { INK } from "@/lib/drawably/inks";
import { Accent } from "./accent";
import { useI18n } from "@/components/i18n-provider";

export function LandingHero() {
  const { language, t } = useI18n();
  const suggestion = useRef<HTMLDivElement>(null);
  const metricsRow = useRef<HTMLDivElement>(null);

  return (
    <section className="relative overflow-hidden px-4 pt-12 pb-16 sm:px-6 md:pt-20 md:pb-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <div className="tilt-a mb-4 inline-block">
              <DrawablyBadge variant="scribble" stroke={INK.amber} className="bg-amber-100 text-ink">
                {t.landing.badge}
              </DrawablyBadge>
            </div>

            <h1 className="text-display font-extrabold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              <Accent text={t.landing.heroTitle} accent={t.landing.heroTitleAccent} />
            </h1>

            <p className="mt-5 max-w-2xl text-body text-secondary sm:text-lg">
              <Accent text={t.landing.heroSubtitle} accent={t.landing.heroSubtitleAccent} mode="highlight" />
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href={`/${language}/app`} tabIndex={-1}>
                <DrawablyButton
                  variant="solid"
                  className="min-h-12 px-6 text-body font-semibold"
                >
                  {t.landing.ctaStart}
                </DrawablyButton>
              </Link>
              <a href="#how-it-works" tabIndex={-1}>
                <DrawablyButton
                  variant="scribble"
                  stroke={INK.teal}
                  className="min-h-12 px-6 text-body font-medium text-ink"
                >
                  {t.landing.ctaHow}
                </DrawablyButton>
              </a>
            </div>

            <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-small text-muted">
              {t.landing.stats.map((stat) => (
                <li key={stat} className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-pass-strong" />
                  {stat}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-5">
            <DrawablyCard className="tilt-b p-6">
              <div className="flex items-center justify-between pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {t.landing.previewTitle}
                  </p>
                  <p className="text-h3 font-bold text-ink">{t.landing.preview.fileTitle}</p>
                </div>
                <div className="flex items-center gap-2">
                  <DrawablyBadge variant="outline" stroke={INK.emerald} className="bg-emerald-100 text-h3 font-bold text-emerald-800">
                    {t.landing.preview.score}
                  </DrawablyBadge>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <div className="flex items-center justify-between px-3 py-2 text-small">
                  <span className="font-medium text-ink">{t.landing.preview.row1}</span>
                  <span className="font-mono font-semibold text-emerald-700">88%</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-small">
                  <span className="font-medium text-ink">{t.landing.preview.row2}</span>
                  <span className="font-mono font-semibold text-emerald-700">92%</span>
                </div>
                <div ref={metricsRow} className="flex items-center justify-between px-3 py-2 text-small">
                  <span className="font-medium text-ink">{t.landing.preview.row3}</span>
                  <span className="font-mono font-semibold text-amber-700">65%</span>
                </div>
              </div>

              <div ref={suggestion} className="mt-5 bg-amber-50/70 p-3.5 text-small">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-900">{t.landing.preview.suggestionTitle}</span>
                  <span className="font-mono text-xs text-amber-700">{t.landing.preview.suggestionLocation}</span>
                </div>
                <p className="mt-1.5 text-xs text-amber-950">{t.landing.preview.suggestionText}</p>
              </div>
              <DrawablyArrow from={suggestion} to={metricsRow} stroke={INK.amber} />
            </DrawablyCard>
          </div>
        </div>
      </div>
    </section>
  );
}
