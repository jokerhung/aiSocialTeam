import "server-only";
import { api } from "@/lib/botteam";
import type { BlotatoAccount } from "@/lib/blotato/shared";

// Social accounts are connected through Composio, which the BotTeam server already talks to (server/botteam/composio.py):
// the key is kept by the server, a sign-in happens on Composio's own page, and the connected accounts come back from
// its API. Only the social apps below are shown here; every other app is managed in BotTeam's Connected apps.

export const SOCIAL_APPS = [
  { slug: "instagram", label: "Instagram" },
  { slug: "tiktok", label: "TikTok" },
  { slug: "youtube", label: "YouTube" },
  { slug: "facebook", label: "Facebook" },
  { slug: "twitter", label: "X (Twitter)" },
  { slug: "linkedin", label: "LinkedIn" },
  { slug: "threads", label: "Threads" },
  { slug: "pinterest", label: "Pinterest" },
  { slug: "reddit", label: "Reddit" },
] as const;

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
  apps?: { slug: string; label: string; blurb?: string; logo?: string | null }[];
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
    error = body.error ?? null;
  } catch (e) {
    error = (e as Error).message;
  }
  const apps = SOCIAL_APPS.map(({ slug, label }): SocialApp => {
    const card = body.apps?.find((a) => a.slug === slug);
    const state = body.connections?.[slug];
    return { slug, label: card?.label && card.label.toLowerCase() !== slug ? card.label : label, blurb: card?.blurb ?? "", logo: card?.logo ?? null, connected: !!state?.connected, pending: !!state?.pending, accounts: state?.accounts ?? [] };
  });
  return { ...key, apps, error };
}

// The connected social accounts in the shape the Accounts page and the post editor use
export async function listAccounts(): Promise<BlotatoAccount[]> {
  const state = await getSocialState({ cached: true }).catch(() => null);
  if (!state) return [];
  return state.apps.flatMap((app) =>
    app.accounts.filter((account) => account.status === "ACTIVE").map((account): BlotatoAccount => ({ id: account.id, platform: app.slug, name: account.alias || app.label, username: null }))
  );
}
