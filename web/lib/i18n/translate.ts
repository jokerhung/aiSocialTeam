import type { Locale } from "@/lib/i18n/config";

// The translator shared by the server and the browser. The key is the English text; {name} is replaced from params.

export type Params = Record<string, string | number>;
export type Translate = (text: string, params?: Params) => string;
// n of something: English has a singular and a plural, Vietnamese has one form (the plural text is the key)
export type TranslatePlural = (n: number, one: string, other: string, params?: Params) => string;

function fill(text: string, params?: Params) {
  return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;
}

// Text in the source language often has stray whitespace (line breaks in JSX); keys are written without it
export function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function makeTranslate(locale: Locale, dictionary: Record<string, string>): Translate {
  return (text, params) => fill(dictionary[normalize(text)] ?? text, params);
}

export function makePlural(locale: Locale, dictionary: Record<string, string>): TranslatePlural {
  return (n, one, other, params) => {
    const source = locale === "en" && n === 1 ? one : other;
    return fill(dictionary[normalize(other)] ?? source, { n, ...params });
  };
}
