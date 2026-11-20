"use client";

/* eslint-disable @next/next/no-img-element -- the paused preview comes from our own API */
import { useEffect, useState } from "react";
import { Hand, KeyRound, LoaderCircle, Maximize2, Monitor, Pause, Play } from "lucide-react";
import { AGENT_ROLES, type WorkerRoleId } from "@/lib/agent-roles";
import { SANDBOX_STATUS_LABELS, type AgentStatusView } from "@/lib/orchestration/types";
import { cn } from "@/lib/utils";
import { OverviewEmptyState } from "@/components/dashboard/overview/overview-panel";
import { useSandboxController } from "@/components/sandbox/sandbox-controller";
import { Button } from "@/components/ui/button";

import { T, useT } from "@/lib/i18n/client";
// An agent's Computer tab: a small live (view-only) preview of the agent's own computer in this
// campaign, with buttons to open it large, take over, pause or start it.
export function ComputerPanel({ agentId, status }: { agentId: WorkerRoleId; status: AgentStatusView | undefined }) {
  const t = useT();
  const { live, openViewer, act } = useSandboxController();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sandbox = live?.sandboxes[agentId];
  const running = sandbox?.status === "running";

  // The view-only stream, fetched again whenever the computer starts or stops
  useEffect(() => {
    if (!running) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/sandbox?mode=view&agent=${agentId}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => !cancelled && setUrl(data?.url ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [running, agentId]);

  async function run(action: "pause" | "start") {
    setBusy(action);
    setError((await act(action, agentId)).error);
    setBusy(null);
  }

  if (!live || !sandbox) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" aria-label={t("Loading the computer")} />
      </div>
    );
  }

  if (sandbox.ended) {
    return (
      <OverviewEmptyState
        Icon={Monitor}
        tone="bg-muted text-muted-foreground"
        glow="shadow-transparent"
        title={t("Computer shut down")}
        description={t("This campaign has ended. Its files were saved to your results before the computer was shut down.")}
      />
    );
  }

  const waitingTask = status?.status === "waiting_for_user" ? status.task : null;
  const caption =
    sandbox.control === "user"
      ? t("You have control. The agent waits until you hand it back.")
      : sandbox.activeTaskId
        ? [t(status?.task?.status === "waiting_for_user" ? "This agent is waiting for you" : "This agent is using it"), status?.task?.currentStep].filter(Boolean).join(" · ")
        : sandbox.status === "none"
          ? t("It starts when the agent needs it.")
          : t("The agent isn't using it right now.");

  return (
    <div className="flex flex-col gap-3">
      {waitingTask && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <KeyRound className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{waitingTask.waitingReason ?? t("This agent is waiting for you on the computer.")}</span>
          <Button className="h-7 rounded-lg px-2.5 text-xs" onClick={() => openViewer({ kind: "login", agentId, taskId: waitingTask.id })}>
            <T>Login now</T>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
            running ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"
          )}
        >
          <span className={cn("size-1.5 rounded-full", running ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/60")} />
          {t(SANDBOX_STATUS_LABELS[sandbox.status])}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{caption}</span>
      </div>

      {/* Small view-only preview; click it for the big view */}
      <button
        type="button"
        onClick={() => openViewer({ kind: "watch", agentId })}
        className="group/preview relative block aspect-[16/10] w-full overflow-hidden rounded-xl bg-muted text-left ring-1 ring-border/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        aria-label={t("Open this agent's computer in a large view")}
      >
        {url ? (
          <iframe src={url} title={t("Computer preview")} tabIndex={-1} className="pointer-events-none absolute inset-0 size-full border-0" />
        ) : sandbox.hasPreview && sandbox.status !== "none" ? (
          <img src={`/api/sandbox/preview?agent=${agentId}&at=${encodeURIComponent(sandbox.activeAt ?? "")}`} alt="" className="absolute inset-0 size-full object-cover opacity-70" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            {running ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Monitor className="size-6" aria-hidden />}
            <span className="text-xs">{running ? t("Connecting…") : t(SANDBOX_STATUS_LABELS[sandbox.status])}</span>
          </span>
        )}
        <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-lg bg-background/85 px-2 py-1 text-xs font-medium opacity-90 shadow-sm backdrop-blur-sm transition-opacity group-hover/preview:opacity-100">
          <Maximize2 className="size-3" aria-hidden />
          <T>Open</T>
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-2">
        {error && <span className="mr-auto text-xs text-destructive">{error}</span>}
        {running ? (
          <Button variant="outline" className="h-8 rounded-lg bg-card px-2.5" disabled={busy !== null} onClick={() => run("pause")}>
            {busy === "pause" ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Pause data-icon="inline-start" />}
            <T>Pause</T>
          </Button>
        ) : (
          <Button variant="outline" className="h-8 rounded-lg bg-card px-2.5" disabled={busy !== null || sandbox.status === "starting"} onClick={() => run("start")}>
            {busy === "start" ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Play data-icon="inline-start" />}
            <T>Start</T>
          </Button>
        )}
        <Button className="h-8 rounded-lg px-2.5" onClick={() => openViewer({ kind: "takeover", agentId })}>
          <Hand data-icon="inline-start" />
          <T>Take over</T>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        <T>This agent's own computer, so it can work while your other agents use theirs. Its logins and files stay on it between tasks. It pauses itself after 3 minutes without use.</T>
      </p>
    </div>
  );
}

// The Master Agent's Computers tab: every agent's computer, so you can watch them work side by side
export function TeamComputers() {
  const t = useT();
  const { live } = useSandboxController();
  return (
    <div className="flex flex-col gap-6">
      {AGENT_ROLES.filter((role) => role.computer).map((role) => (
        <section key={role.id} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t(role.name)}</h3>
          <ComputerPanel agentId={role.id} status={live?.agents.find((agent) => agent.agentId === role.id)} />
        </section>
      ))}
    </div>
  );
}
