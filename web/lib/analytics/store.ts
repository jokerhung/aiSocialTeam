import "server-only";
import { api } from "@/lib/botteam";
import type { AnalyticsPost, SyncState } from "@/lib/analytics/shared";

// Post analytics from the BotTeam server: the numbers entered for each published post (PUT /api/social/posts/{id}/metrics).
export async function listAnalyticsPosts(_userId?: string, options: { campaignId?: number } = {}) {
  const query = options.campaignId !== undefined ? `?campaignId=${options.campaignId}` : "";
  return (await api<{ posts: AnalyticsPost[] }>(`/api/social/analytics${query}`)).posts;
}

export async function getSyncState(_userId?: string): Promise<SyncState> {
  return (await api<{ sync: SyncState }>("/api/social/analytics")).sync;
}
