"use client";

import { useId, useState } from "react";
import { DrawablyCard } from "@/lib/drawably";
import { useI18n } from "@/components/i18n-provider";

export function LandingFaq() {
  const { t } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const baseId = useId();

  const faqs = [
    { q: t.landing.faq.q1, a: t.landing.faq.a1 },
    { q: t.landing.faq.q2, a: t.landing.faq.a2 },
    { q: t.landing.faq.q3, a: t.landing.faq.a3 },
    { q: t.landing.faq.q4, a: t.landing.faq.a4 },
  ];

  return (
    <section id="faq" className="border-t border-subtle bg-paper/60 px-4 py-16 sm:px-6 md:py-24">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-secondary">Answers</p>
          <h2 className="mt-2 text-h2 font-bold tracking-tight text-ink sm:text-3xl">
            {t.landing.faq.title}
          </h2>
        </div>

        <div className="mt-10 space-y-4">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            const buttonId = `${baseId}-faq-btn-${i}`;
            const panelId = `${baseId}-faq-panel-${i}`;

            return (
              <DrawablyCard key={i} className="mb-2 p-1">
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="flex min-h-12 w-full items-center justify-between px-6 py-4 text-left font-semibold text-ink transition-colors hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  >
                    <span className="text-body font-semibold">{faq.q}</span>
                    <span
                      aria-hidden="true"
                      className="ml-4 font-mono text-lg font-bold text-secondary transition-transform"
                    >
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                </h3>
                {isOpen && (
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    className="border-t border-subtle/50 px-6 pt-3 pb-5 text-small leading-relaxed text-secondary"
                  >
                    {faq.a}
                  </div>
                )}
              </DrawablyCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
