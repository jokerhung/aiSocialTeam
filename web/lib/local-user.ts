import "server-only";
import { getActiveCampaign } from "@/lib/campaigns";

// BotTeam runs on one computer for one person, so there is no sign-in: this is that person.
export const LOCAL_USER = { id: "local", email: "you@this-computer", profile: { name: "You", avatar_url: undefined as string | undefined } };

export async function getCurrentUser() {
  return LOCAL_USER;
}

export type Scope = { userId: string; campaignId: number };

// The active campaign as a scope, for API routes; null without a campaign
export async function getRequestScope(): Promise<Scope | null> {
  const campaign = await getActiveCampaign(LOCAL_USER.id);
  return campaign ? { userId: LOCAL_USER.id, campaignId: campaign.id } : null;
}
