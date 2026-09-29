"use client";

import { LandingNavbar } from "./navbar";
import { LandingHero } from "./hero";
import { LandingEngineExplainer } from "./engine-explainer";
import { LandingRubricTransparency } from "./rubric-transparency";
import { LandingPrivacyByok } from "./privacy-byok";
import { LandingDisclaimerNotice } from "./disclaimer-notice";
import { LandingFaq } from "./faq";
import { LandingFooter } from "./footer";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-paper font-sans text-ink selection:bg-amber-200">
      <LandingNavbar />
      <main id="main-content">
        <LandingHero />
        <LandingEngineExplainer />
        <LandingRubricTransparency />
        <LandingPrivacyByok />
        <LandingDisclaimerNotice />
        <LandingFaq />
      </main>
      <LandingFooter />
    </div>
  );
}
