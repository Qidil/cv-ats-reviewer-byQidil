"use client";

import { DrawablyCard, DrawablyList } from "@/lib/drawably";
import { Accent } from "./accent";
import { useI18n } from "@/components/i18n-provider";

const PILLAR_TILT = ["tilt-a", "tilt-b", "tilt-c", "tilt-d"] as const;

export function LandingRubricTransparency() {
  const { t } = useI18n();

  const pillars = [
    {
      weight: "10%",
      title: t.landing.rubric.pillar1Title,
      desc: t.landing.rubric.pillar1Desc,
    },
    {
      weight: "20%",
      title: t.landing.rubric.pillar2Title,
      desc: t.landing.rubric.pillar2Desc,
    },
    {
      weight: "30%",
      title: t.landing.rubric.pillar3Title,
      desc: t.landing.rubric.pillar3Desc,
    },
    {
      weight: "40%",
      title: t.landing.rubric.pillar4Title,
      desc: t.landing.rubric.pillar4Desc,
    },
  ];

  return (
    <section id="rubric" data-section="rubric" className="border-t border-subtle bg-white px-4 py-16 sm:px-6 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-secondary">{t.landing.rubric.eyebrow}</p>
          <h2 className="mt-2 text-h2 font-bold tracking-tight text-ink sm:text-3xl">
            <Accent text={t.landing.rubric.title} accent={t.landing.rubric.titleAccent} />
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-body text-secondary">
            {t.landing.rubric.subtitle}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((pillar, i) => (
            <DrawablyCard key={pillar.weight} className={`${PILLAR_TILT[i]} p-5`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xl font-bold text-ink">{pillar.weight}</span>
                <span aria-hidden className="h-2 w-2 rounded-full bg-pass-strong" />
              </div>
              <h3 className="mt-3 text-body font-bold text-ink">{pillar.title}</h3>
              <p className="mt-2 text-small leading-normal text-secondary">{pillar.desc}</p>
            </DrawablyCard>
          ))}
        </div>

        <div className="mt-12">
          <DrawablyCard className="tilt-d p-6 sm:p-8">
            <h3 className="text-h3 font-bold text-ink">
              {t.landing.rubric.promptTitle}
            </h3>

            <div className="mt-6">
              <DrawablyList marker="check" className="space-y-3 text-small text-ink">
                {t.landing.rubric.promptRules.map((rule) => (
                  <li key={rule} className="leading-relaxed">
                    {rule}
                  </li>
                ))}
              </DrawablyList>
            </div>
          </DrawablyCard>
        </div>
      </div>
    </section>
  );
}
