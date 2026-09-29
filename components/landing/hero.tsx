"use client";

import Link from "next/link";
import {
  DrawablyBadge,
  DrawablyButton,
  DrawablyCard,
  DrawablyUnderline,
} from "@/lib/drawably";
import { useI18n } from "@/components/i18n-provider";

export function LandingHero() {
  const { language, t } = useI18n();

  return (
    <section className="relative overflow-hidden px-4 pt-12 pb-16 sm:px-6 md:pt-20 md:pb-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <div className="mb-4 inline-block">
              <DrawablyBadge variant="scribble" className="bg-amber-100 text-ink">
                {t.landing.badge}
              </DrawablyBadge>
            </div>

            <h1 className="text-display font-extrabold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {language === "id" ? (
                <>
                  Audit CV Anda dengan{" "}
                  <DrawablyUnderline>standar ATS nyata</DrawablyUnderline> secara presisi
                </>
              ) : (
                <>
                  Audit your CV against{" "}
                  <DrawablyUnderline>real ATS criteria</DrawablyUnderline> with precision
                </>
              )}
            </h1>

            <p className="mt-5 max-w-2xl text-body text-secondary sm:text-lg">
              {t.landing.heroSubtitle}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href={`/${language}/app`} tabIndex={-1}>
                <DrawablyButton
                  variant="solid"
                  className="min-h-12 px-6 text-body font-semibold shadow-md"
                >
                  {t.landing.ctaStart}
                </DrawablyButton>
              </Link>
              <a href="#how-it-works" tabIndex={-1}>
                <DrawablyButton
                  variant="outline"
                  tone="neutral"
                  className="min-h-12 px-6 text-body font-medium"
                >
                  {t.landing.ctaHow}
                </DrawablyButton>
              </a>
            </div>

            <div className="mt-8 flex items-center gap-6 text-small text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-pass-strong" />
                Zero server file storage
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-pass-strong" />
                No registration required
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-pass-strong" />
                10 Free analyses daily
              </span>
            </div>
          </div>

          <div className="lg:col-span-5">
            <DrawablyCard className="p-6">
              <div className="flex items-center justify-between pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {t.landing.previewTitle}
                  </p>
                  <p className="text-h3 font-bold text-ink">Software Engineer CV</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-100 px-3 py-1 font-mono text-h3 font-bold text-emerald-800">
                    84 / 100
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <div className="flex items-center justify-between px-3 py-2 text-small">
                  <span className="font-medium text-ink">Keyword & Skills Match</span>
                  <span className="font-mono font-semibold text-emerald-700">88%</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-small">
                  <span className="font-medium text-ink">Document Structure</span>
                  <span className="font-mono font-semibold text-emerald-700">92%</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-small">
                  <span className="font-medium text-ink">Content Impact & Metrics</span>
                  <span className="font-mono font-semibold text-amber-700">65%</span>
                </div>
              </div>

              <div className="mt-5 bg-amber-50/70 p-3.5 text-small">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-900">
                    {language === "id" ? "Saran Prioritas Tinggi" : "High Priority Suggestion"}
                  </span>
                  <span className="font-mono text-xs text-amber-700">Page 1, Line 18</span>
                </div>
                <p className="mt-1.5 text-xs text-amber-950">
                  {language === "id"
                    ? "Sertakan metrik kuantitatif pada Pengalaman Kerja. Ubah 'Bertanggung jawab atas pipeline CI/CD' menjadi 'Membangun pipeline CI/CD yang memangkas waktu rilis dari 45 menit menjadi 8 menit'."
                    : "Add quantitative metrics to Work Experience. Change 'Responsible for CI/CD pipeline' to 'Architected CI/CD pipeline reducing deployment cycle from 45 to 8 minutes'."}
                </p>
              </div>
            </DrawablyCard>
          </div>
        </div>
      </div>
    </section>
  );
}
