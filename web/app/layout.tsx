import "./globals.css";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getT, dictionaryFor } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { setDisplayLocale } from "@/lib/i18n/display";

const jakarta = Plus_Jakarta_Sans({
  // "vietnamese" carries the accented letters; without it they fall back to another font
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-jakarta",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: { default: t("SocialTeam — AI Social Media Agents"), template: "%s · SocialTeam" },
    description: t("An AI team that plans, creates and publishes your social media content."),
    icons: { icon: { url: "/socialteam.svg", type: "image/svg+xml" } },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { locale } = await getT();
  setDisplayLocale(locale);
  return (
    <html lang={locale} className={jakarta.variable}>
      <body>
        <I18nProvider locale={locale} dictionary={dictionaryFor(locale)}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
