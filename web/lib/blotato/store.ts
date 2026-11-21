import "server-only";
import { listAccounts } from "@/lib/composio";
import { accountsByPlatform, NOT_CONNECTED, type IntegrationView } from "@/lib/blotato/shared";
import type { PostPlatform } from "@/lib/posts/shared";

// The social accounts posts go to: the accounts connected through Composio (lib/composio.ts). The "Blotato" names
// only keep the shape of the types the pages were written with.

export async function getBlotatoIntegration(_userId?: string): Promise<IntegrationView> {
  const accounts = await listAccounts();
  return accounts.length ? { connected: true, keyHint: null, accounts, refreshedAt: new Date().toISOString() } : NOT_CONNECTED;
}

// The platforms posts can go to right now, with their accounts
export async function getPublishingAccounts(_userId?: string) {
  const byPlatform = accountsByPlatform(await listAccounts());
  const platforms = Object.keys(byPlatform).filter((platform) => byPlatform[platform]?.length);
  return { platforms: platforms as PostPlatform[], byPlatform };
}
