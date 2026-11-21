import "server-only";
import { api } from "@/lib/botteam";
import type { BlotatoAccount } from "@/lib/blotato/shared";
import { isKnownPlatform, platformName } from "@/lib/social-platforms";

// Social accounts are connected through Composio, which the BotTeam server already talks to (server/botteam/composio.py):
// the key is kept by the server, a sign-in happens on Composio's own page, and the connected accounts come back from
// its API. Which apps are social networks is Composio's own call (its "social media accounts" category), so a new app
// there shows up here with no change in the code; every other app is managed in BotTeam's Connected apps.
export const SOCIAL_CATEGORY = "social media accounts";
// Apps in that category that are tools about social networks, not the networks (MCP servers, data scrapers)
const NOT_A_NETWORK = new Set(["model context protocol", "ai web scraping"]);
// More than this many would bury the page; Composio lists the most used first
const MAX_SOCIAL_APPS = 24;

export type ComposioAccount = { id: string; alias: string | null; status: string };
export type SocialApp = {
  slug: string;
  label: string;
  blurb: string;
  logo: string | null;
  connected: boolean;
  pending: boolean;
  accounts: ComposioAccount[];
};
export type SocialState = {
  configured: boolean;
  keyHint: string | null;
  source: string | null;
  apps: SocialApp[];
  error: string | null;
};

type KeyState = { configured: boolean; keyHint: string | null; source: string | null };
type AppsBody = {
  apps?: { slug: string; label: string; blurb?: string; logo?: string | null; categories?: string[] }[];
  connections?: Record<string, { connected: boolean; pending: boolean; accounts: ComposioAccount[] }>;
  error?: string | null;
};

// The social apps with their connected accounts. cached: use what the server saved, without asking Composio again.
export async function getSocialState({ cached = false }: { cached?: boolean } = {}): Promise<SocialState> {
  const key = await api<KeyState>("/api/composio");
  if (!key.configured) return { ...key, apps: [], error: null };
  let body: AppsBody = {};
  let error: string | null = null;
  try {
    body = await api<AppsBody>(`/api/apps${cached ? "?cached=true" : ""}`);
    // A catalog saved before categories were kept has none: ask Composio again once
    if (body.apps?.length && !body.apps.some((app) => app.categories)) body = await api<AppsBody>("/api/apps/refresh", { method: "POST" });
    error = body.error ?? null;
  } catch (e) {
    error = (e as Error).message;
  }
  const apps = (body.apps ?? [])
    .filter((card) => card.categories?.includes(SOCIAL_CATEGORY) && !card.categories.some((category) => NOT_A_NETWORK.has(category)))
    .slice(0, MAX_SOCIAL_APPS)
    .map((card): SocialApp => {
      const state = body.connections?.[card.slug];
      return { slug: card.slug, label: isKnownPlatform(card.slug) ? platformName(card.slug) : card.label, blurb: card.blurb ?? "", logo: card.logo ?? null, connected: !!state?.connected, pending: !!state?.pending, accounts: state?.accounts ?? [] };
    });
  return { ...key, apps, error };
}

// Whether Composio files this app under social networks (it must be, for a sign-in started from the Integrations page)
export async function isSocialApp(slug: string) {
  return (await getSocialState({ cached: true }).catch(() => null))?.apps.some((app) => app.slug === slug) ?? false;
}

// The connected social accounts in the shape the Accounts page and the post editor use
export async function listAccounts(): Promise<BlotatoAccount[]> {
  const state = await getSocialState({ cached: true }).catch(() => null);
  if (!state) return [];
  return state.apps.flatMap((app) =>
    app.accounts.filter((account) => account.status === "ACTIVE").map((account): BlotatoAccount => ({ id: account.id, platform: app.slug, name: account.alias || app.label, username: null }))
  );
}
