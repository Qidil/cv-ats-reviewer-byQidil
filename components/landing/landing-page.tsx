"use client";

import { DrawablyDivider } from "@/lib/drawably";
import { LandingNavbar } from "./navbar";
import { LandingHero } from "./hero";
import { LandingEngineExplainer } from "./engine-explainer";
import { LandingRubricTransparency } from "./rubric-transparency";
import { LandingPrivacyByok } from "./privacy-byok";
import { LandingDisclaimerNotice } from "./disclaimer-notice";
import { LandingFaq } from "./faq";
import { LandingFooter } from "./footer";
import { Reveal } from "./reveal";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-paper font-sans text-ink selection:bg-amber-200">
      <LandingNavbar />
      <main id="main-content">
        <Reveal>
          <LandingHero />
        </Reveal>
        <DrawablyDivider className="mx-auto max-w-6xl" />
        <Reveal>
          <LandingEngineExplainer />
        </Reveal>
        <DrawablyDivider className="mx-auto max-w-6xl" />
        <Reveal>
          <LandingRubricTransparency />
        </Reveal>
        <DrawablyDivider className="mx-auto max-w-6xl" />
        <Reveal>
          <LandingPrivacyByok />
        </Reveal>
        <Reveal>
          <LandingDisclaimerNotice />
        </Reveal>
        <DrawablyDivider className="mx-auto max-w-6xl" />
        <Reveal>
          <LandingFaq />
        </Reveal>
      </main>
      <LandingFooter />
    </div>
  );
}
