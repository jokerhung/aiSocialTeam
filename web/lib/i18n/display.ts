import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "@/lib/i18n/config";

// The language dates and numbers are shown in. The layout sets it for every request and the provider sets it in the
// browser, so formatters can be called anywhere without handing the language down. (A request that renders while another
// one is in the middle of its render could briefly see the other's language; the app has one person on one computer.)
let current: Locale = DEFAULT_LOCALE;

export function setDisplayLocale(locale: Locale) {
  current = locale;
}

export function displayLocale(): Locale {
  return current;
}

// The BCP 47 tag for Intl, in the display language
export function intlLocale() {
  return INTL_LOCALE[current];
}
