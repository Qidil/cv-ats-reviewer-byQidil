"use client";

import { DrawablyBadge, DrawablyCard } from "@/lib/drawably";
import { INK } from "@/lib/drawably/inks";
import { useI18n } from "@/components/i18n-provider";

export function LandingDisclaimerNotice() {
  const { t } = useI18n();

  return (
    <section className="border-t border-subtle bg-white px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <DrawablyCard stroke={INK.coral} className="tilt-c bg-amber-50/40 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="flex-shrink-0">
              <DrawablyBadge variant="scribble" className="bg-amber-200 text-xs font-bold text-amber-900">
                {t.landing.disclaimer.badge}
              </DrawablyBadge>
            </div>
            <div>
              <h3 className="text-body font-bold text-amber-950">
                {t.landing.disclaimer.title}
              </h3>
              <p className="mt-2 text-small leading-relaxed text-amber-900">
                {t.landing.disclaimer.text}
              </p>
            </div>
          </div>
        </DrawablyCard>
      </div>
    </section>
  );
}
