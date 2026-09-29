"use client";

import { DrawablyCard } from "@/lib/drawably";
import { useI18n } from "@/components/i18n-provider";

export function LandingPrivacyByok() {
  const { t } = useI18n();

  const cards = [
    {
      title: t.landing.privacy.card1Title,
      desc: t.landing.privacy.card1Desc,
      icon: (
        <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      title: t.landing.privacy.card2Title,
      desc: t.landing.privacy.card2Desc,
      icon: (
        <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      ),
    },
    {
      title: t.landing.privacy.card3Title,
      desc: t.landing.privacy.card3Desc,
      icon: (
        <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
    },
  ];

  return (
    <section id="privacy" className="border-t border-subtle bg-paper/60 px-4 py-16 sm:px-6 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-secondary">Trust & Security</p>
          <h2 className="mt-2 text-h2 font-bold tracking-tight text-ink sm:text-3xl">
            {t.landing.privacy.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-body text-secondary">
            {t.landing.privacy.subtitle}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
          {cards.map((card, i) => (
            <DrawablyCard key={i} className="flex flex-col justify-between p-6">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50">
                  {card.icon}
                </div>
                <h3 className="mt-5 text-h3 font-bold text-ink">{card.title}</h3>
                <p className="mt-2.5 text-small leading-relaxed text-secondary">{card.desc}</p>
              </div>
            </DrawablyCard>
          ))}
        </div>
      </div>
    </section>
  );
}
