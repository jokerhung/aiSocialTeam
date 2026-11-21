import "./globals.css";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getT, dictionaryFor } from "@/lib/i18n/server";
import Script from "next/script";
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
        {process.env.NODE_ENV !== "production" && (
          // React's development timings can ask the browser for a measure that starts before the page did (the server's and
          // the browser's clocks differ a little), which throws "cannot have a negative time stamp" on every page. Skip only
          // that error; it is a log line for developers and does nothing in a production build.
          <Script id="perf-measure-guard" strategy="beforeInteractive">
            {`(function(){var m=window.performance&&performance.measure;if(!m||m.__guarded)return;var g=function(){try{return m.apply(this,arguments)}catch(e){if(e&&/negative time stamp/i.test(String(e.message)))return undefined;throw e}};g.__guarded=true;performance.measure=g})();`}
          </Script>
        )}
        <I18nProvider locale={locale} dictionary={dictionaryFor(locale)}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
