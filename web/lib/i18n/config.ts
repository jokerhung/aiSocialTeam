// Languages of the interface. English is the source language: the English text itself is the key of every
// translation (see messages/vi.ts), and a text with no translation is shown in English.
export const LOCALES = ["en", "vi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LANGUAGE_COOKIE = "lang";
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Names in their own language, short codes for the sidebar
export const LANGUAGES: Record<Locale, { name: string; code: string }> = {
  en: { name: "English", code: "EN" },
  vi: { name: "Tiếng Việt", code: "VI" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// "vi-VN,vi;q=0.9,en;q=0.8" → "vi"; anything else → English
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  const first = (header ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first === "vi" || first.startsWith("vi-") ? "vi" : DEFAULT_LOCALE;
}

// The BCP 47 tag that Intl uses for each language
export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", vi: "vi-VN" };
