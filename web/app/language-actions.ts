"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/botteam";
import { getT } from "@/lib/i18n/server";
import { isLocale, LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE } from "@/lib/i18n/config";

// Saves the interface language (a cookie, so Server Components render in it at once) and refreshes the pages
export async function setLanguage(locale: string): Promise<{ error?: string }> {
  if (!isLocale(locale)) return { error: (await getT()).t("Unknown language.") };
  (await cookies()).set(LANGUAGE_COOKIE, locale, { path: "/", maxAge: LANGUAGE_COOKIE_MAX_AGE, sameSite: "lax" });
  revalidatePath("/", "layout");
  // The server keeps the language too, for the BotTeam UI and the Administrator bot; the web app works without it
  await api("/api/config", { method: "PUT", json: { language: locale } }).catch(() => undefined);
  return {};
}
