import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { I18nProvider } from "@/components/i18n-provider";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLanguage } from "@/lib/i18n/language";

export default async function AppPage({ params }: PageProps<"/[lang]/app">) {
  const { lang } = await params;
  if (!isLanguage(lang)) {
    notFound();
  }
  return (
    <I18nProvider language={lang} dictionary={getDictionary(lang)}>
      <Dashboard />
    </I18nProvider>
  );
}
