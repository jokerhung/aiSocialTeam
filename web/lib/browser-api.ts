import "server-only";

import { z } from "zod";
import { AGENT_ROLES, MASTER_AGENT } from "@/lib/agent-roles";
import { getActiveCampaign } from "@/lib/campaigns";

const BrowserAgent = z.enum([MASTER_AGENT.id, ...AGENT_ROLES.map(({ id }) => id)]);

export async function browserTarget(request: Request) {
  const params = new URL(request.url).searchParams;
  const role = BrowserAgent.safeParse(params.get("agentId"));
  if (!role.success) return null;
  const campaign = await getActiveCampaign();
  if (!campaign || campaign.id !== Number(params.get("campaignId"))) return null;
  const bot = campaign.bots[role.data];
  if (!bot) return null;
  const surface = params.get("surface") === "computer" ? "computer" : "browser";
  return { campaignId: campaign.id, role: role.data, surface, path: `/api/bots/${encodeURIComponent(bot)}/${surface}` };
}
