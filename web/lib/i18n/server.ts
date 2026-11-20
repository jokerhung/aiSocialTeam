import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { isLocale, LANGUAGE_COOKIE, localeFromAcceptLanguage, type Locale } from "@/lib/i18n/config";
import { vi } from "@/lib/i18n/messages/vi";
import { makePlural, makeTranslate } from "@/lib/i18n/translate";

// Only the languages that have a dictionary; English is the source text itself
export function dictionaryFor(locale: Locale): Record<string, string> {
  return locale === "vi" ? vi : {};
}

// The language of this request: the saved choice, else the browser's language
export const getLocale = cache(async (): Promise<Locale> => {
  const saved = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
});

// For Server Components, server actions and route handlers
export async function getT() {
  const locale = await getLocale();
  const dictionary = dictionaryFor(locale);
  return { locale, t: makeTranslate(locale, dictionary), tn: makePlural(locale, dictionary) };
}
