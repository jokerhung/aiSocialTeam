import { getActiveCampaign } from "@/lib/campaigns";
import { api } from "@/lib/botteam";
import { listBots } from "@/lib/agent-chats";
import { isLive, listCampaignAssignments, taskStatusOf, titleOf, type Assignment } from "@/lib/team-work";
import { getT } from "@/lib/i18n/server";
import type { AgentLiveStatus, AgentStatusView, AgentSurfaceView, LiveStatus } from "@/lib/orchestration/types";
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
  const [bots, assignments, browserStatus, computerStatus, selection] = await Promise.all([
    listBots().catch(() => []),
    listCampaignAssignments(campaign).catch(() => [] as Assignment[]),
    api<{ browsers: Record<string, AgentStatusView["browser"]> }>("/api/browsers").catch(() => null),
    api<{ computers: Record<string, { running: boolean; held: boolean; status: AgentSurfaceView["status"]; helpReason: string | null }> }>("/api/computers").catch(() => null),
    api<{ surfaces: Record<string, AgentSurfaceView["surface"]> }>(`/api/social/campaigns/${campaign.id}/surfaces`).catch(() => null),
  ]);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const agents: AgentStatusView[] = ROLES.map((agentId) => {
    const botId = campaign.bots[agentId];
    const surface = selection?.surfaces[agentId] ?? "browser";
    const computer = computerStatus?.computers[botId];
    const browser = surface === "computer"
      ? computer && { running: computer.running, busy: computer.running && !computer.held, helpReason: computer.helpReason }
      : surface === "browser" ? browserStatus?.browsers[botId] : undefined;
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
    if (browser?.helpReason) status = "waiting_for_user";
    if (status === "idle") return { agentId, status, task: null, browser, surface };

    const taskStatus = status === "done" ? "completed" : status === "running" ? "in_progress" : status === "needs_input" || status === "waiting_for_user" ? "awaiting_input" : "failed";
    const title = (job && titleOf(job.brief)) || bot?.statusLine || (status === "needs_input" ? t("Waiting for your answer") : t("Working"));
    return {
      agentId,
      status,
      browser,
      surface,
      task: {
        id: job ? Number(job.createdAt) : 0,
        planId: 0,
        title,
        status: taskStatus,
        currentStep: status === "running" ? (bot?.statusLine ?? null) : null,
        waitingReason: browser?.helpReason ?? (status === "needs_input" ? t("Open the bot in BotTeam to answer its question.") : null),
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
  const surfaces = agents.map(({ agentId, surface, browser }): AgentSurfaceView => {
    const computer = surface === "computer" ? computerStatus?.computers[campaign.bots[agentId]] : undefined;
    return { agentId, surface: surface ?? "browser", status: computer?.status ?? (browser?.running ? "running" : "none"),
      control: computer?.held || browser?.helpReason ? "user" : "agent", url: null, helpReason: browser?.helpReason ?? null };
  });
  const body: LiveStatus = { agents, serverTime: nowIso, surfaces };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
