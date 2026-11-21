import { getActiveCampaign } from "@/lib/campaigns";
import { api } from "@/lib/botteam";
import { listBots } from "@/lib/agent-chats";
import { isLive, listCampaignAssignments, taskStatusOf, titleOf, type Assignment } from "@/lib/team-work";
import { getT } from "@/lib/i18n/server";
import type { AgentLiveStatus, AgentStatusView, LiveStatus } from "@/lib/orchestration/types";
import type { AgentRoleId } from "@/lib/agent-roles";

export const runtime = "nodejs";

const ROLES: AgentRoleId[] = ["master", "research", "creator", "scheduler", "analytics"];
// A finished job still shows as "Done" for this long
const DONE_FOR_MS = 30 * 60 * 1000;

function statusOf(activity: string): AgentLiveStatus {
  if (activity === "working") return "running";
  if (activity === "waiting-on-you") return "needs_input";
  if (activity === "dead" || activity === "no-signal") return "failed";
  return "idle";
}

// What every agent is doing right now: each is a BotTeam bot, so this is the bot's own activity, with the job the
// Master Agent gave it (BotTeam assignments) as the task
export async function GET() {
  const { t } = await getT();
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: t("No active campaign") }, { status: 400 });
  const [bots, assignments, browserStatus] = await Promise.all([
    listBots().catch(() => []),
    listCampaignAssignments(campaign).catch(() => [] as Assignment[]),
    api<{ browsers: Record<string, AgentStatusView["browser"]> }>("/api/browsers").catch(() => null),
  ]);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const agents: AgentStatusView[] = ROLES.map((agentId) => {
    const botId = campaign.bots[agentId];
    const browser = browserStatus?.browsers[botId];
    const bot = bots.find((b) => b.id === botId);
    // Jobs handed to this agent (the Master Agent's own turns are not jobs), newest last
    const jobs = assignments.filter((a) => a.botId === botId && a.parentId !== null);
    const live = [...jobs].reverse().find(isLive);
    const latest = jobs.at(-1);
    let status = statusOf(bot?.activity ?? "idle");
    let job: Assignment | undefined = live;
    if (status === "idle" && live) status = "running";
    if (status === "idle" && !live && latest && taskStatusOf(latest) === "completed" && now - Number(latest.createdAt) < DONE_FOR_MS) {
      status = "done";
      job = latest;
    }
    if (status === "idle") return { agentId, status, task: null, browser };

    const taskStatus = status === "done" ? "completed" : status === "running" ? "in_progress" : status === "needs_input" ? "awaiting_input" : "failed";
    const title = (job && titleOf(job.brief)) || bot?.statusLine || (status === "needs_input" ? t("Waiting for your answer") : t("Working"));
    return {
      agentId,
      status,
      browser,
      task: {
        id: job ? Number(job.createdAt) : 0,
        planId: 0,
        title,
        status: taskStatus,
        currentStep: status === "running" ? (bot?.statusLine ?? null) : null,
        waitingReason: status === "needs_input" ? t("Open the bot in BotTeam to answer its question.") : null,
        interruption: null,
        error: null,
        summary: status === "done" ? (job?.result ?? "").slice(0, 300) || null : null,
        scheduledAt: job ? new Date(Number(job.createdAt)).toISOString() : nowIso,
        startedAt: job ? new Date(Number(job.createdAt)).toISOString() : nowIso,
        waitingSince: null,
        expiresAt: null,
        completedAt: status === "done" ? nowIso : null,
        artifactCount: 0,
        artifacts: [],
      },
    };
  });
  const body: LiveStatus = { agents, serverTime: nowIso };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
