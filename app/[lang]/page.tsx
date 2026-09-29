import { notFound } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { I18nProvider } from "@/components/i18n-provider";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLanguage } from "@/lib/i18n/language";
import packageJson from "@/package.json";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLanguage(lang)) {
    notFound();
  }
  return (
    <I18nProvider language={lang} dictionary={getDictionary(lang)}>
      <LandingPage version={packageJson.version} />
    </I18nProvider>
  );
}
