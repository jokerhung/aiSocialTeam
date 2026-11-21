"use client";

import { useState } from "react";
import { format, formatDistanceToNow } from "@/lib/i18n/format";
import {
  Ban,
  CalendarClock,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleX,
  Eye,
  KeyRound,
  ListChecks,
  LoaderCircle,
  MessageCircleQuestion,
  Repeat,
  RotateCcw,
  TimerOff,
  type LucideIcon,
} from "lucide-react";
import { getAgentRole, type AgentRoleId } from "@/lib/agent-roles";
import { describeRepeat } from "@/lib/orchestration/repeat";
import {
  PLAN_STATUS_LABELS,
  TASK_STATUS_LABELS,
  type CommunicationKind,
  type PlanStatus,
  type PlanView,
  type TaskStatus,
  type TaskView,
} from "@/lib/orchestration/types";
import { cn } from "@/lib/utils";
import { OverviewEmptyState } from "@/components/dashboard/overview/overview-panel";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import type { WorkspaceAgent } from "@/components/agents/agent-workspace";
import { ArtifactGrid, DraftList, ResearchList } from "@/components/agents/task-results";
import { Button } from "@/components/ui/button";

import { T, useT } from "@/lib/i18n/client";
export type PlanAction = "cancel" | "retry";

const TASK_TONES: Record<TaskStatus, { Icon: LucideIcon; tone: string; spin?: boolean }> = {
  pending: { Icon: CalendarClock, tone: "bg-muted text-muted-foreground" },
  queued: { Icon: CircleDashed, tone: "bg-sky-500/8 text-sky-700 dark:text-sky-300" },
  in_progress: { Icon: LoaderCircle, tone: "bg-sky-500/12 text-sky-700 dark:text-sky-300", spin: true },
  in_review: { Icon: Eye, tone: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  awaiting_input: { Icon: MessageCircleQuestion, tone: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  waiting_for_user: { Icon: KeyRound, tone: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  completed: { Icon: CircleCheck, tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  failed: { Icon: CircleX, tone: "bg-destructive/10 text-destructive" },
  cancelled: { Icon: Ban, tone: "bg-muted text-muted-foreground" },
  expired: { Icon: TimerOff, tone: "bg-destructive/10 text-destructive" },
};

const PLAN_TONES: Record<PlanStatus, string> = {
  in_progress: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  awaiting_user: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  completed: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const KIND_LABELS: Record<CommunicationKind, string> = {
  assignment: "assigned",
  question: "asked",
  answer: "answered",
  update: "update",
  result: "delivered",
  review: "reviewed",
  clarification: "clarification",
  error: "problem",
};

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const t = useT();
  const { Icon, tone, spin } = TASK_TONES[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", tone, className)}>
      <Icon className={cn("size-3", spin && "animate-spin")} aria-hidden />
      {t(TASK_STATUS_LABELS[status])}
    </span>
  );
}

export function MasterTasks({
  plans,
  loaded,
  agents,
  onAction,
  onOpenBrowser,
}: {
  plans: PlanView[];
  loaded: boolean;
  agents: WorkspaceAgent[];
  onAction: (planId: number, action: PlanAction) => Promise<string | null>;
  onOpenBrowser: (role: AgentRoleId) => void;
}) {
  const t = useT();
  if (!loaded) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" aria-label={t("Loading tasks")} />
      </div>
    );
  }
  if (plans.length === 0) {
    return (
      <OverviewEmptyState
        Icon={ListChecks}
        tone="bg-linear-to-br from-indigo-500 to-fuchsia-600 text-white"
        glow="shadow-violet-500/30"
        title={t("No plans yet")}
        description={t("Tell the Master Agent what you need in the chat. It will plan the work, assign it to the team and track it here.")}
      />
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {plans.map((plan) => (
        <li key={plan.id}>
          <PlanCard plan={plan} agents={agents} onAction={onAction} onOpenBrowser={onOpenBrowser} />
        </li>
      ))}
    </ol>
  );
}

function PlanCard({
  plan,
  agents,
  onAction,
  onOpenBrowser,
}: {
  plan: PlanView;
  agents: WorkspaceAgent[];
  onAction: (planId: number, action: PlanAction) => Promise<string | null>;
  onOpenBrowser: (role: AgentRoleId) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<PlanAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = plan.tasks.filter((task) => task.status === "completed").length;
  const percent = plan.tasks.length ? Math.round((done / plan.tasks.length) * 100) : 0;
  const active = plan.status === "in_progress" || plan.status === "awaiting_user";
  const retryable = plan.status === "failed" || plan.status === "cancelled";
  // A finished plan can still have repeating tasks on the schedule
  const repeating = !active && plan.tasks.some((task) => task.repeat && (task.status === "pending" || task.status === "queued"));
  const positions = new Map(plan.tasks.map((task, index) => [task.id, index + 1]));

  async function act(action: PlanAction) {
    setBusy(action);
    setError(await onAction(plan.id, action));
    setBusy(null);
  }

  return (
    <article className="rounded-2xl bg-card p-4 ring-1 ring-border/70">
      <header className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm leading-snug font-semibold tracking-tight">{plan.title}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("Plan #{id}", { id: plan.id })} · {formatDistanceToNow(new Date(plan.createdAt), { addSuffix: true })}
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", PLAN_TONES[plan.status])}>{t(PLAN_STATUS_LABELS[plan.status])}</span>
      </header>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t("Plan progress")}>
          <div className="h-full rounded-full bg-linear-to-r from-indigo-500 to-fuchsia-500 transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("{done}/{total} done", { done, total: plan.tasks.length })}
        </span>
      </div>

      <ol className="mt-3 flex flex-col gap-1.5">
        {plan.tasks.map((task) => (
          <li key={task.id}>
            <TaskRow task={task} agent={agentFor(agents, task.agentId)} positions={positions} communications={plan.communications.filter((m) => m.taskId === task.id)}
              onOpenBrowser={() => onOpenBrowser(task.agentId)} />
          </li>
        ))}
      </ol>

      {plan.summary && (
        <details className="group/summary mt-3 rounded-xl bg-muted/50 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium">
            <ChevronDown className="size-3.5 transition-transform group-open/summary:rotate-180" aria-hidden />
            <T>Master Agent's report</T>
          </summary>
          <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap">{plan.summary}</p>
        </details>
      )}
      {plan.status === "failed" && plan.error && <p className="mt-3 text-xs whitespace-pre-wrap text-destructive">{plan.error}</p>}

      {(active || retryable || repeating) && (
        <footer className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {error && <span className="mr-auto text-xs text-destructive">{error}</span>}
          {(active || repeating) && (
            <Button variant="outline" className="h-7 rounded-lg bg-card px-2.5 text-xs" disabled={busy !== null} onClick={() => act("cancel")}>
              {busy === "cancel" ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Ban data-icon="inline-start" />}
              {active ? t("Cancel plan") : t("Stop repeating")}
            </Button>
          )}
          {retryable && (
            <Button variant="outline" className="h-7 rounded-lg bg-card px-2.5 text-xs" disabled={busy !== null} onClick={() => act("retry")}>
              {busy === "retry" ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <RotateCcw data-icon="inline-start" />}
              <T>Retry</T>
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}

function TaskRow({
  task,
  agent,
  positions,
  communications,
  onOpenBrowser,
}: {
  task: TaskView;
  agent: WorkspaceAgent;
  positions: Map<number, number>;
  communications: PlanView["communications"];
  onOpenBrowser: () => void;
}) {
  const t = useT();
  const after = task.dependsOn.map((id) => positions.get(id)).filter(Boolean);
  const scheduled = task.status === "pending" || task.status === "queued";
  const runAt = new Date(task.scheduledAt);
  const showTime = scheduled && runAt.getTime() > Date.now() + 60_000;
  return (
    <details className="group/task rounded-xl transition-colors open:bg-muted/40 hover:bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 p-1.5">
        <AgentAvatar role={agent.role} sprite={agent.sprite} className="size-7" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{task.title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {t(agent.role.name)}
            {after.length > 0 && ` · after step ${after.join(", ")}`}
            {task.revisions > 0 && ` · revised`}
            {showTime && ` · ${format(runAt, t("MMM d, h:mm a"))}`}
            {task.repeat && task.runCount > 0 && ` · ${task.runCount} ${task.runCount === 1 ? "run" : "runs"}`}
          </span>
        </span>
        {task.repeat && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("Repeats")} />}
        <TaskStatusBadge status={task.status} />
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/task:rotate-180" aria-hidden />
      </summary>

      <div className="space-y-3 px-2 pt-1 pb-3 text-xs leading-relaxed">
        <Section label={t("Instructions")}>{task.instructions}</Section>
        {(showTime || task.repeat) && (
          <Section label={t("Schedule")}>
            {showTime ? t("Runs {when}", { when: format(runAt, t("EEE, MMM d 'at' h:mm a")) }) : task.status === "completed" ? t("Finished") : t("Running now or next up")}
            {task.repeat && `\n${describeRepeat(task.repeat, t)}`}
            {task.repeat && task.nextRunAt && `\n${t("Then {when}", { when: format(new Date(task.nextRunAt), t("EEE, MMM d 'at' h:mm a")) })}`}
          </Section>
        )}
        {task.status === "in_progress" && task.currentStep && <Section label={t("Right now")}>{task.currentStep}</Section>}
        {task.question && <Section label={t("Waiting for your answer")} tone="text-amber-700 dark:text-amber-300">{task.question}</Section>}
        {task.status === "waiting_for_user" && task.interruption && <WaitingForUser task={task} onOpenBrowser={onOpenBrowser} />}
        {task.error && task.status !== "completed" && <Section label={t("Problem")} tone="text-destructive">{task.error}</Section>}
        {task.drafts.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-muted-foreground"><T>Drafts</T></p>
            <DraftList drafts={task.drafts} />
          </div>
        )}
        {task.research.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-muted-foreground"><T>Research</T></p>
            <ResearchList research={task.research} />
          </div>
        )}
        {task.artifacts.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-muted-foreground"><T>Results</T></p>
            <ArtifactGrid artifacts={task.artifacts} />
          </div>
        )}
        {task.output && task.drafts.length === 0 && task.research.length === 0 && <Section label={t("Work")}>{task.output}</Section>}
        {task.output && (task.drafts.length > 0 || task.research.length > 0) && (
          <details className="group/work">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-muted-foreground">
              <ChevronDown className="size-3.5 transition-transform group-open/work:rotate-180" aria-hidden />
              <T>Full report</T>
            </summary>
            <p className="mt-1 whitespace-pre-wrap break-words">{task.output}</p>
          </details>
        )}
        {task.review && <Section label={t("Master Agent's review")}>{task.review}</Section>}
        {communications.length > 0 && (
          <div>
            <p className="mb-1.5 font-medium text-muted-foreground"><T>Agent conversation</T></p>
            <ol className="space-y-1.5 border-l border-border pl-3">
              {communications.map((message) => (
                <li key={message.id}>
                  <span className="font-medium">{speaker(message.from)}</span>
                  <span className="text-muted-foreground"> {KIND_LABELS[message.kind]} · {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</span>
                  <p className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">{message.text}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </details>
  );
}

function WaitingForUser({ task, onOpenBrowser }: { task: TaskView; onOpenBrowser: () => void }) {
  return (
    <div className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-amber-800 dark:text-amber-200">
      <p className="font-medium"><T>Waiting for you in the browser</T></p>
      <p className="mt-0.5">{task.interruption?.reason}</p>
      <Button
        className="mt-2 h-7 rounded-lg px-2.5 text-xs"
        onClick={onOpenBrowser}
      >
        <KeyRound data-icon="inline-start" />
        <T>Open the browser</T>
      </Button>
    </div>
  );
}

function Section({ label, tone, children }: { label: string; tone?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 font-medium text-muted-foreground">{label}</p>
      <p className={cn("whitespace-pre-wrap break-words", tone)}>{children}</p>
    </div>
  );
}

function speaker(id: AgentRoleId | "user") {
  const t = useT();
  return id === "user" ? t("You") : t(getAgentRole(id).name);
}

// The workspace's look for an agent (office sprite), or a plain one for agents without a desk
export function agentFor(agents: WorkspaceAgent[], roleId: AgentRoleId): WorkspaceAgent {
  return agents.find((agent) => agent.role.id === roleId) ?? { id: roleId, role: getAgentRole(roleId) };
}
