"use client";

import { DrawablyBadge, DrawablyCard, DrawablySteps } from "@/lib/drawably";
import { INK } from "@/lib/drawably/inks";
import { Accent } from "./accent";
import { useI18n } from "@/components/i18n-provider";

export function LandingEngineExplainer() {
  const { t } = useI18n();

  const steps = [
    {
      badge: t.landing.engine.step1Badge,
      title: t.landing.engine.step1Title,
      desc: t.landing.engine.step1Desc,
      ink: INK.teal,
      badgeText: "text-teal-800",
    },
    {
      badge: t.landing.engine.step2Badge,
      title: t.landing.engine.step2Title,
      desc: t.landing.engine.step2Desc,
      ink: INK.blue,
      badgeText: "text-ink",
    },
    {
      badge: t.landing.engine.step3Badge,
      title: t.landing.engine.step3Title,
      desc: t.landing.engine.step3Desc,
      ink: INK.amber,
      // The amber ink is 3.0:1: strokes only, so the label takes the darker tone (StyleGuide §8.1b).
      badgeText: "text-amber-800",
    },
  ];

  return (
    <section id="how-it-works" className="border-t border-subtle bg-paper/60 px-4 py-16 sm:px-6 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-secondary">{t.landing.engine.eyebrow}</p>
          <h2 className="mt-2 text-h2 font-bold tracking-tight text-ink sm:text-3xl">
            <Accent text={t.landing.engine.title} accent={t.landing.engine.titleAccent} />
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-body text-secondary">
            {t.landing.engine.subtitle}
          </p>
        </div>

        <div className="mt-12">
          <DrawablyCard className="tilt-d p-6 sm:p-8">
            <DrawablySteps className="space-y-6">
              {steps.map((item) => (
                <li key={item.title}>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-h3 font-bold text-ink">{item.title}</h3>
                    <DrawablyBadge variant="outline" stroke={item.ink} className={`text-xs ${item.badgeText}`}>
                      {item.badge}
                    </DrawablyBadge>
                  </div>
                  <p className="mt-2 text-small leading-relaxed text-secondary">{item.desc}</p>
                </li>
              ))}
            </DrawablySteps>
          </DrawablyCard>
        </div>
      </div>
    </section>
  );
}
