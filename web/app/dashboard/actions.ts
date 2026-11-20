"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/botteam";
import { ACTIVE_CAMPAIGN_COOKIE, listUserCampaigns } from "@/lib/campaigns";

export async function switchCampaign(campaignId: number) {
  // Only allow switching to a campaign that exists
  if (!(await listUserCampaigns()).some((c) => c.id === campaignId)) return;

  (await cookies()).set(ACTIVE_CAMPAIGN_COOKIE, String(campaignId), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/dashboard", "layout");
}

// Ends a campaign: no new work is planned in it. Its bots stay in BotTeam with their history.
export async function endCampaign(campaignId: number): Promise<{ error?: string }> {
  try {
    await api(`/api/social/campaigns/${campaignId}/end`, { method: "POST" });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "That didn't work. Please try again." };
  }
  revalidatePath("/dashboard", "layout");
  return {};
}
