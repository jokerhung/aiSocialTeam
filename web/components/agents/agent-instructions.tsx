"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentRoleId } from "@/lib/agent-roles";
import { T, useT } from "@/lib/i18n/client";

// The agent's instructions as they are saved on its BotTeam bot: edit them here, or ask the agent to remember something and it
// adds it to the same text. Loaded again whenever the agent changes, so what the agent saved shows up.
export function AgentInstructions({ roleId, roleName }: { roleId: AgentRoleId; roleName: string }) {
  const t = useT();
  const [saved, setSaved] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(signal?: AbortSignal) {
    setError(null);
    const response = await fetch(`/api/agents/instructions?agentId=${roleId}`, { cache: "no-store", signal }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (signal?.aborted) return;
    if (!response?.ok || typeof body?.instructions !== "string") return setError(body?.error ?? t("Couldn't load the instructions."));
    setSaved(body.instructions);
    setText(body.instructions);
  }

  useEffect(() => {
    setSaved(null);
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [roleId]);

  async function save() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/agents/instructions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: roleId, instructions: text }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) return setError(body?.error ?? t("Couldn't save. Please try again."));
    setSaved(text);
  }

  const changed = saved !== null && text !== saved;
  return (
    <div className="space-y-2 px-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <label htmlFor="agent-instructions" className="block text-sm font-semibold">
          <T>Soul (instructions)</T>
        </label>
        {saved !== null && <span className="text-xs text-muted-foreground">{t("{count} characters", { count: text.length.toLocaleString() })}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("The whole text the {name} is given before every task: its role, how it saves posts and makes pictures, and what it learned from you. When you ask it to remember something, it adds that here. Edit it freely, but keep the parts that explain its tools.", { name: roleName })}
      </p>
      <Textarea
        id="agent-instructions"
        value={text}
        disabled={saved === null && !error}
        onChange={(event) => setText(event.target.value)}
        className="h-80 max-h-[28rem] min-h-40 resize-y overflow-y-auto rounded-xl font-mono text-xs leading-relaxed field-sizing-fixed"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="rounded-lg" disabled={busy || !changed} onClick={save}>
          <T>Save soul</T>
        </Button>
        <Button size="sm" variant="outline" className="rounded-lg" disabled={busy || !changed} onClick={() => setText(saved ?? "")}>
          <T>Discard changes</T>
        </Button>
        <Button size="sm" variant="ghost" className="rounded-lg" disabled={busy} onClick={() => void load()}>
          <T>Reload</T>
        </Button>
      </div>
    </div>
  );
}
