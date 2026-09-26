"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Language } from "@/lib/i18n/language";

interface I18nValue {
  language: Language;
  t: Dictionary;
}

const I18nContext = createContext<I18nValue | null>(null);

/** The server page picks the dictionary for the URL's language (ADR-008); only that one reaches the browser. */
export function I18nProvider({ language, dictionary, children }: { language: Language; dictionary: Dictionary; children: ReactNode }) {
  return <I18nContext.Provider value={{ language, t: dictionary }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (value === null) {
    throw new Error("useI18n must be used inside I18nProvider.");
  }
  return value;
}
