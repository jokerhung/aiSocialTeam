import { getActiveCampaign } from "@/lib/campaigns";
import { getLatestChatMessageIds, listBots } from "@/lib/agent-chats";
import { listCampaignAssignments, toPlans } from "@/lib/team-work";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// The campaign's plans: what the Master Agent handed to its team, from BotTeam's assignments. The Master Agent's
// newest message id lets its chat pick up what it said in the background.
export async function GET(request: Request) {
  const { t } = await getT();
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: t("No active campaign") }, { status: 400 });
  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")) || 10, 1), 20);
  try {
    const [assignments, bots, lastMessageIds] = await Promise.all([
      listCampaignAssignments(campaign),
      listBots().catch(() => []),
      getLatestChatMessageIds(campaign),
    ]);
    const lines = Object.fromEntries(bots.map((bot) => [bot.id, bot.statusLine]));
    return Response.json({ plans: toPlans(assignments, campaign, lines, limit), lastMasterMessageId: lastMessageIds.master ?? 0, lastMessageIds }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ plans: [], lastMasterMessageId: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST() {
  const { t } = await getT();
  return Response.json({ error: t("Tasks are managed in the agents' chats.") }, { status: 409 });
}
