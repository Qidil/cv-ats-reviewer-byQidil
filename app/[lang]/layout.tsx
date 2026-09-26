import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { LANGUAGES, isLanguage } from "@/lib/i18n/language";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

/** ADR-008: both languages are built ahead of time; any other segment is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return LANGUAGES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLanguage(lang)) {
    return {};
  }
  const { meta } = getDictionary(lang);
  return {
    title: meta.title,
    description: meta.description,
    alternates: { languages: { en: "/en", id: "/id" } },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLanguage(lang)) {
    notFound();
  }
  return (
    <html lang={lang} className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
