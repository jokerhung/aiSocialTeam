import { getActiveCampaign } from "@/lib/campaigns";
import { getLatestChatMessageId } from "@/lib/agent-chats";

export const runtime = "nodejs";

// The campaign's plans. The agents are BotTeam bots that hand work to each other in their own conversations, so
// there are no separate plans to list; the Master Agent's newest message id still lets its chat pick up news.
export async function GET() {
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: "No active campaign" }, { status: 400 });
  const lastMasterMessageId = await getLatestChatMessageId(campaign.bots.master).catch(() => 0);
  return Response.json({ plans: [], lastMasterMessageId }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  return Response.json({ error: "Tasks are managed in the agents' chats." }, { status: 409 });
}
