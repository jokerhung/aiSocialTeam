import "server-only";
import { api } from "@/lib/botteam";
import type { Campaign } from "@/lib/campaigns";
import type { AgentRoleId, WorkerRoleId } from "@/lib/agent-roles";
import type { CommunicationView, PlanStatus, PlanView, TaskStatus, TaskView } from "@/lib/orchestration/types";

// The work the Master Agent hands to its team. BotTeam keeps it as "assignments" (server/botteam/runtime.py): the
// Master Agent's own turn is the root, each teammate's job is a child of it. Here they are shown as plans and tasks.

export type Assignment = {
  id: string;
  botId: string;
  status: string;
  outcome: string | null;
  detail: string | null;
  result: string | null;
  threadId: string;
  parentId: string | null;
  rootId: string;
  createdAt: string;
  brief: string | null;
  dependsOn?: string[];
  review?: boolean;
};

const ROLES: AgentRoleId[] = ["master", "research", "creator", "scheduler", "analytics"];

export function roleOfBot(campaign: Campaign, botId: string): AgentRoleId | null {
  return ROLES.find((role) => campaign.bots[role] === botId) ?? null;
}

// Every assignment of this campaign's bots, oldest first
export async function listCampaignAssignments(campaign: Campaign): Promise<Assignment[]> {
  const ids = new Set(Object.values(campaign.bots));
  const { assignments } = await api<{ assignments: Assignment[] }>("/api/assignments");
  return assignments.filter((a) => ids.has(a.botId)).sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
}

export function taskStatusOf(a: Assignment): TaskStatus {
  switch (a.status) {
    case "queued":
      return "queued";
    case "running":
    case "waiting":
    case "resume":
      return "in_progress";
    case "needs_input":
      return "awaiting_input";
    case "review":
      return "in_review";
    case "completed":
      return "completed";
    case "cancelled":
    case "stopped":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return a.outcome === "completed" ? "completed" : a.outcome ? "failed" : "in_progress";
  }
}

export const isLive = (a: Assignment) => ["queued", "running", "waiting", "resume", "needs_input", "review"].includes(a.status);

// "Nhiệm vụ: kiểm chứng 7 tin…\n\nVới mỗi tin…" → "kiểm chứng 7 tin…"
export function titleOf(brief: string | null) {
  const first = (brief ?? "").split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  const title = first.replace(/^(nhiệm vụ|task|brief)\s*:\s*/i, "");
  return title.length > 110 ? `${title.slice(0, 107)}…` : title;
}

const iso = (ms: string | number) => new Date(Number(ms)).toISOString();

// The newest plans: one per request the Master Agent took, with the jobs it gave out
export function toPlans(assignments: Assignment[], campaign: Campaign, statusLines: Record<string, string | null>, limit: number): PlanView[] {
  const byRoot = new Map<string, Assignment[]>();
  for (const a of assignments) (byRoot.get(a.rootId) ?? byRoot.set(a.rootId, []).get(a.rootId)!).push(a);

  const plans: PlanView[] = [];
  const roots = [...byRoot.keys()].sort((a, b) => Number(byRoot.get(a)![0].createdAt) - Number(byRoot.get(b)![0].createdAt));
  for (const [rootId, rows] of byRoot) {
    const root = rows.find((a) => a.id === rootId);
    const children = rows.filter((a) => a.id !== rootId && roleOfBot(campaign, a.botId) && roleOfBot(campaign, a.botId) !== "master");
    if (!root || children.length === 0) continue;

    // Plans are numbered in the order they were made (the first request is #1); a task's number is its plan's and its place in it
    const planId = roots.indexOf(rootId) + 1;
    const taskIds = new Map(children.map((a, index) => [a.id, planId * 100 + index + 1]));
    const tasks: TaskView[] = children.map((a, index): TaskView => {
      const status = taskStatusOf(a);
      const live = isLive(a);
      return {
        id: planId * 100 + index + 1,
        assignmentId: a.id,
        planId,
        agentId: roleOfBot(campaign, a.botId) as WorkerRoleId,
        title: titleOf(a.brief) || "…",
        instructions: a.brief ?? "",
        dependsOn: (a.dependsOn ?? []).flatMap((id) => taskIds.get(id) ?? []),
        status,
        scheduledAt: iso(a.createdAt),
        repeat: null,
        nextRunAt: null,
        runCount: 1,
        output: a.result,
        question: null,
        review: null,
        revisions: 0,
        attempts: 1,
        error: status === "failed" ? (a.detail ?? a.outcome) : null,
        currentStep: live ? (statusLines[a.botId] ?? null) : null,
        interruption: null,
        waitingSince: null,
        expiresAt: null,
        artifacts: [],
        drafts: [],
        research: [],
        startedAt: iso(a.createdAt),
        completedAt: live ? null : new Date().toISOString(),
        updatedAt: iso(a.createdAt),
      };
    });

    const communications: CommunicationView[] = children.flatMap((a, index): CommunicationView[] => {
      const taskId = planId * 100 + index + 1;
      const agent = roleOfBot(campaign, a.botId) as AgentRoleId;
      const rows: CommunicationView[] = [
        { id: taskId * 2, taskId, from: "master", to: agent, kind: "assignment", text: a.brief ?? "", createdAt: iso(a.createdAt) },
      ];
      if (a.result && !isLive(a)) rows.push({ id: taskId * 2 + 1, taskId, from: agent, to: "master", kind: "result", text: a.result.slice(0, 3000), createdAt: iso(a.createdAt) });
      return rows;
    });

    const live = tasks.some((task) => task.status === "in_progress" || task.status === "queued" || task.status === "awaiting_input");
    const failed = tasks.some((task) => task.status === "failed");
    const reviewing = tasks.some((task) => task.status === "in_review");
    const status: PlanStatus = reviewing ? "awaiting_user" : live || root.status === "running" ? "in_progress" : failed ? "failed" : "completed";
    const title = tasks.length === 1 ? tasks[0].title : tasks.map((task) => task.title).join(" · ");
    plans.push({
      id: planId,
      title: title.length > 120 ? `${title.slice(0, 117)}…` : title,
      request: tasks.map((task) => task.title).join("\n"),
      status,
      summary: root.result ?? null,
      error: null,
      createdAt: iso(root.createdAt),
      updatedAt: iso(Math.max(...children.map((a) => Number(a.createdAt)))),
      tasks,
      communications,
    });
  }
  return plans.sort((a, b) => b.id - a.id).slice(0, limit);
}
