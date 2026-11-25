"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Globe, Hourglass, KeyRound, ListChecks, LoaderCircle, Paperclip, RotateCcw, Timer } from "lucide-react";
import type { AgentRole } from "@/lib/agent-roles";
import type { AgentStatusView } from "@/lib/orchestration/types";
import { AgentAvatar, AgentStatus } from "@/components/agents/agent-avatar";
import { ArtifactGrid, formatElapsed, useNow } from "@/components/agents/task-results";
import { Button } from "@/components/ui/button";

import { T, useI18n } from "@/lib/i18n/client";
// What an office agent is doing, shown when you hover (or focus) it. Everything here is the live
// status from the database (/api/agents/status), polled by the workspace; nothing is assumed.
export function AgentPreviewCard({
  role,
  sprite,
  status,
  onOpen,
  onOpenBrowser,
  refresh,
  retryTask,
}: {
  role: AgentRole;
  sprite?: string;
  // Undefined until the first status has loaded
  status: AgentStatusView | undefined;
  onOpen: () => void;
  onOpenBrowser: () => void;
  refresh: () => void;
  retryTask: (id: number) => Promise<string | null>;
}) {
  const { t, tn } = useI18n();
  // Opening the popover fetches the latest status rather than showing what the last poll saw
  useEffect(() => {
    refresh();
  }, [refresh]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const task = status?.task ?? null;
  const current = status?.status;
  const ticking = current === "running" || current === "waiting_for_user" || current === "needs_input" || current === "queued";
  const now = useNow(ticking);

  // Running: since it started. Waiting: since it stopped. Finished: how long it took.
  const since = current === "waiting_for_user" ? task?.waitingSince : task?.startedAt;
  const elapsed =
    task && since
      ? current === "done" || current === "failed" || current === "expired"
        ? task.completedAt
          ? formatElapsed(new Date(task.completedAt).getTime() - new Date(since).getTime())
          : null
        : formatElapsed(now - new Date(since).getTime())
      : null;

  const browser = status?.browser;

  async function retry() {
    if (!task) return;
    setBusy(true);
    setError(await retryTask(task.id));
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <header className="flex items-center gap-2.5">
        <AgentAvatar role={role} sprite={sprite} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight font-semibold">{t(role.name)}</p>
          <AgentStatus status={status?.status ?? null} className="mt-0.5 px-1.5 py-0 text-[11px]" />
        </div>
      </header>

      {!status ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" aria-hidden />
          <T>Checking what it's doing…</T>
        </p>
      ) : !task ? (
        <p className="text-xs text-muted-foreground"><T>No tasks yet. Ask the Master Agent for work and it will assign some.</T></p>
      ) : (
        <>
          <div className="space-y-1 text-xs">
            <p className="flex items-start gap-1.5">
              <ListChecks className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 font-medium">{task.title}</span>
            </p>
            {task.currentStep && current === "running" && (
              <p className="flex items-start gap-1.5 text-muted-foreground">
                <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">{task.currentStep}</span>
              </p>
            )}
            <dl className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-muted-foreground">
              {elapsed && (
                <div className="flex items-center gap-1">
                  <Timer className="size-3" aria-hidden />
                  <dt className="sr-only"><T>Elapsed</T></dt>
                  <dd className="tabular-nums">{elapsed}</dd>
                </div>
              )}
              {browser?.busy && (
                <div className="flex items-center gap-1">
                  <Globe className="size-3" aria-hidden />
                  <dt className="sr-only">{status.surface === "computer" ? t("Computer") : t("Browser")}</dt>
                  <dd>{status.surface === "computer" ? t("Using the computer") : t("Browsing the web")}</dd>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Paperclip className="size-3" aria-hidden />
                <dt className="sr-only"><T>Results</T></dt>
                <dd className="tabular-nums">
                  {tn(task.artifactCount, "{n} file", "{n} files")}
                </dd>
              </div>
            </dl>
          </div>

          {(current === "waiting_for_user" || current === "needs_input") && (
            <div className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-200">
              <p className="flex items-start gap-1.5">
                {current === "waiting_for_user" ? <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <Hourglass className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                <span>{task.waitingReason ?? t("It's waiting for you.")}</span>
              </p>
              {current === "waiting_for_user" && (
                <Button className="mt-2 h-7 w-full rounded-lg text-xs" onClick={onOpenBrowser}>
                  <Globe data-icon="inline-start" />
                  {status.surface === "computer" ? t("Open the computer") : t("Open the browser")}
                </Button>
              )}
              {current === "needs_input" && (
                <p className="mt-1 text-[11px] opacity-80">
                  {task.status === "in_review" ? t("Approve or reject it in the Master Agent's Tasks tab.") : t("Answer it in the Master Agent's chat.")}
                </p>
              )}
            </div>
          )}

          {current === "done" && (
            <>
              {task.summary && <p className="line-clamp-4 text-xs whitespace-pre-wrap text-muted-foreground">{task.summary}</p>}
              <ArtifactGrid artifacts={task.artifacts} total={task.artifactCount} compact />
            </>
          )}

          {(current === "failed" || current === "expired") && (
            <div className="rounded-lg bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
              <p>{task.error ?? (current === "expired" ? t("Nobody picked this up in time.") : t("It couldn't finish this task."))}</p>
              <Button variant="outline" className="mt-2 h-7 w-full rounded-lg bg-card text-xs text-foreground" disabled={busy} onClick={retry}>
                {busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <RotateCcw data-icon="inline-start" />}
                <T>Retry</T>
              </Button>
              {error && <p className="mt-1">{error}</p>}
            </div>
          )}
        </>
      )}

      {browser?.helpReason && (
        <div className="space-y-1 rounded-lg bg-amber-500/10 p-2 text-xs">
          <p>{t("Agent needs you: {reason}", { reason: browser.helpReason })}</p>
          <Button size="sm" onClick={onOpenBrowser}>{status?.surface === "computer" ? t("Open the computer") : t("Open the browser")}</Button>
        </div>
      )}
      <Button variant="ghost" className="h-7 justify-between rounded-lg px-2 text-xs" onClick={onOpen}>
        {t("Open {name}", { name: t(role.name) })}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </div>
  );
}
