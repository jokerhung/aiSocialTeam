import { getActiveCampaign } from "@/lib/campaigns";
import { listBots } from "@/lib/agent-chats";
import type { AgentLiveStatus, AgentStatusView, LiveStatus } from "@/lib/orchestration/types";
import type { AgentRoleId } from "@/lib/agent-roles";

export const runtime = "nodejs";

const ROLES: AgentRoleId[] = ["master", "research", "creator", "scheduler", "analytics"];

function statusOf(activity: string): AgentLiveStatus {
  if (activity === "working") return "running";
  if (activity === "waiting-on-you") return "needs_input";
  if (activity === "dead" || activity === "no-signal") return "failed";
  return "idle";
}

// What every agent is doing right now: each is a BotTeam bot, so this is the bot's own activity
export async function GET() {
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: "No active campaign" }, { status: 400 });
  const bots = await listBots().catch(() => []);
  const now = new Date().toISOString();
  const agents: AgentStatusView[] = ROLES.map((agentId) => {
    const bot = bots.find((b) => b.id === campaign.bots[agentId]);
    const status = statusOf(bot?.activity ?? "idle");
    return {
      agentId,
      status,
      task:
        status === "idle"
          ? null
          : {
              id: 0,
              planId: 0,
              title: bot?.statusLine || (status === "needs_input" ? "Waiting for your answer" : "Working"),
              status: status === "running" ? "in_progress" : "awaiting_input",
              currentStep: bot?.statusLine ?? null,
              waitingReason: status === "needs_input" ? "Open the bot in BotTeam to answer its question." : null,
              interruption: null,
              error: null,
              summary: null,
              scheduledAt: now,
              startedAt: now,
              waitingSince: null,
              expiresAt: null,
              completedAt: null,
              artifactCount: 0,
              artifacts: [],
            },
    };
  });
  const body: LiveStatus = { agents, sandboxes: {}, serverTime: now };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
