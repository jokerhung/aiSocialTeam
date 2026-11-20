"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { setDisplayLocale } from "@/lib/i18n/display";
import { makePlural, makeTranslate, type Translate, type TranslatePlural } from "@/lib/i18n/translate";

type Value = { locale: Locale; t: Translate; tn: TranslatePlural };

const I18nContext = createContext<Value>({ locale: DEFAULT_LOCALE, t: makeTranslate(DEFAULT_LOCALE, {}), tn: makePlural(DEFAULT_LOCALE, {}) });

// The layout hands over the language and only that language's dictionary, so the other one is not sent to the browser
export function I18nProvider({ locale, dictionary, children }: { locale: Locale; dictionary: Record<string, string>; children: React.ReactNode }) {
  setDisplayLocale(locale);
  const value = useMemo(() => ({ locale, t: makeTranslate(locale, dictionary), tn: makePlural(locale, dictionary) }), [locale, dictionary]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useT() {
  return useContext(I18nContext).t;
}

export function useLocale() {
  return useContext(I18nContext).locale;
}

// Translated text in JSX, for Server and Client Components alike: <T>Create post</T>
export function T({ children, params }: { children: string; params?: Record<string, string | number> }) {
  const { t } = useContext(I18nContext);
  return <>{t(children, params)}</>;
}
