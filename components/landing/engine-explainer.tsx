"use client";

import { DrawablyBadge, DrawablyCard } from "@/lib/drawably";
import { useI18n } from "@/components/i18n-provider";

export function LandingEngineExplainer() {
  const { t } = useI18n();

  const steps = [
    {
      step: "01",
      badge: "PDF.js Sandbox",
      title: t.landing.engine.step1Title,
      desc: t.landing.engine.step1Desc,
    },
    {
      step: "02",
      badge: "Deterministic",
      title: t.landing.engine.step2Title,
      desc: t.landing.engine.step2Desc,
    },
    {
      step: "03",
      badge: "AI Failover",
      title: t.landing.engine.step3Title,
      desc: t.landing.engine.step3Desc,
    },
  ];

  return (
    <section id="how-it-works" className="border-t border-subtle bg-paper/60 px-4 py-16 sm:px-6 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-secondary">Architecture</p>
          <h2 className="mt-2 text-h2 font-bold tracking-tight text-ink sm:text-3xl">
            {t.landing.engine.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-body text-secondary">
            {t.landing.engine.subtitle}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
          {steps.map((item) => (
            <DrawablyCard
              key={item.step}
              className="flex flex-col justify-between p-6"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xl font-black text-ink/30">{item.step}</span>
                  <DrawablyBadge variant="outline" className="text-xs">
                    {item.badge}
                  </DrawablyBadge>
                </div>
                <h3 className="mt-4 text-h3 font-bold text-ink">{item.title}</h3>
                <p className="mt-3 text-small leading-relaxed text-secondary">{item.desc}</p>
              </div>
            </DrawablyCard>
          ))}
        </div>
      </div>
    </section>
  );
}
