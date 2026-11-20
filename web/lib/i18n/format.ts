import { format as dfFormat, formatDistanceToNow as dfFormatDistanceToNow, type FormatDistanceToNowOptions } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { vi } from "date-fns/locale/vi";
import { displayLocale } from "@/lib/i18n/display";

// date-fns in the display language. Same names as date-fns, so a file switches by changing its import.
const LOCALES = { en: enUS, vi } as const;

export function format(date: Date | number | string, pattern: string) {
  return dfFormat(date, pattern, { locale: LOCALES[displayLocale()] });
}

export function formatDistanceToNow(date: Date | number | string, options: FormatDistanceToNowOptions = {}) {
  return dfFormatDistanceToNow(date, { ...options, locale: LOCALES[displayLocale()] });
}
