"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/botteam";
import { getSocialState, SOCIAL_APPS, type SocialState } from "@/lib/composio";

export type ActionResult = { error?: string };

const isSocial = (slug: string) => SOCIAL_APPS.some((app) => app.slug === slug);
const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

function revalidate() {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/posts", "layout");
}

// Saves the Composio API key on the BotTeam server (it is checked there and never sent back)
export async function saveComposioKey(key: string): Promise<ActionResult> {
  if (key.trim().length < 8) return { error: "That doesn't look like a Composio API key." };
  try {
    await api("/api/composio/key", { method: "PUT", json: { key: key.trim() } });
  } catch (error) {
    return { error: message(error, "The key couldn't be checked. Please try again.") };
  }
  revalidate();
  return {};
}

export async function clearComposioKey(): Promise<ActionResult> {
  try {
    await api("/api/composio/key", { method: "DELETE" });
  } catch (error) {
    return { error: message(error, "Couldn't remove the key.") };
  }
  revalidate();
  return {};
}

// Starts a sign-in for a social app: returns the Composio page to open. alias names the account when the app
// already has one.
export async function connectSocialApp(slug: string, alias?: string): Promise<ActionResult & { url?: string }> {
  if (!isSocial(slug)) return { error: "Unknown app." };
  try {
    const { url } = await api<{ url: string }>(`/api/apps/${slug}/connect`, { method: "POST", json: { alias: alias?.trim() || null } });
    return { url };
  } catch (error) {
    return { error: message(error, "Couldn't start the sign-in. Please try again.") };
  }
}

export async function disconnectSocialAccount(slug: string, accountId: string): Promise<ActionResult> {
  if (!isSocial(slug)) return { error: "Unknown app." };
  try {
    await api(`/api/apps/${slug}/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
  } catch (error) {
    return { error: message(error, "Couldn't disconnect the account.") };
  }
  revalidate();
  return {};
}

// Asks Composio again (after a sign-in finished, or on Refresh)
export async function refreshSocialApps(): Promise<{ state?: SocialState; error?: string }> {
  try {
    await api("/api/apps/refresh", { method: "POST" });
    const state = await getSocialState({ cached: true });
    revalidate();
    return { state };
  } catch (error) {
    return { error: message(error, "Couldn't refresh. Please try again.") };
  }
}

// What the server has saved, to watch a sign-in finish
export async function readSocialApps(): Promise<{ state?: SocialState; error?: string }> {
  try {
    return { state: await getSocialState({ cached: true }) };
  } catch (error) {
    return { error: message(error, "Couldn't load the apps.") };
  }
}
