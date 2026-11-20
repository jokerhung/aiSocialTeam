"use client";

import { useEffect, useState } from "react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { AgentRoleId } from "@/lib/agent-roles";

type Selection = { instanceId: string; model: string; effort: string | null };
type Engine = { id: string; name: string; models: { id: string; label: string }[]; efforts: string[] };

const EFFORT_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };

// Engine, model and thinking level of an agent: saved on its BotTeam bot, so they apply to its next message
export function AgentModelPicker({ roleId }: { roleId: AgentRoleId }) {
  const [state, setState] = useState<{ selection: Selection; engines: Engine[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stale = false;
    setState(null);
    setError(null);
    fetch(`/api/agents/model?agentId=${roleId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body) throw new Error(body?.error ?? "Couldn't load the model settings.");
        if (!stale) setState(body);
      })
      .catch((e: Error) => !stale && setError(e.message));
    return () => {
      stale = true;
    };
  }, [roleId]);

  async function save(next: Selection) {
    if (!state) return;
    const previous = state.selection;
    setState({ ...state, selection: next });
    setSaving(true);
    setError(null);
    const response = await fetch("/api/agents/model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: roleId, ...next }),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      setState((current) => (current ? { ...current, selection: previous } : current));
      setError(body?.error ?? "Couldn't save. Please try again.");
    }
  }

  if (error && !state) return <p className="px-3 text-xs text-destructive">{error}</p>;
  if (!state) return <p className="px-3 text-xs text-muted-foreground">Loading model settings…</p>;

  const { selection, engines } = state;
  const engine = engines.find((e) => e.id === selection.instanceId) ?? engines[0];
  const efforts = engine?.efforts ?? [];

  function chooseEngine(id: string) {
    const target = engines.find((e) => e.id === id);
    if (!target) return;
    const model = target.models.find((m) => "default" in m && m.default)?.id ?? target.models[0]?.id ?? "default";
    save({ instanceId: id, model, effort: selection.effort && target.efforts.includes(selection.effort) ? selection.effort : null });
  }

  return (
    <div className="space-y-3 px-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">
          Engine
          <NativeSelect className="block w-full" disabled={saving} value={selection.instanceId} onChange={(e) => chooseEngine(e.target.value)}>
            {engines.map((e) => (
              <NativeSelectOption key={e.id} value={e.id}>
                {e.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          Model
          <NativeSelect className="block w-full" disabled={saving} value={selection.model} onChange={(e) => save({ ...selection, model: e.target.value })}>
            {engine?.models.map((m) => (
              <NativeSelectOption key={m.id} value={m.id}>
                {m.label}
              </NativeSelectOption>
            ))}
            {engine && !engine.models.some((m) => m.id === selection.model) && <NativeSelectOption value={selection.model}>{selection.model}</NativeSelectOption>}
          </NativeSelect>
        </label>
      </div>
      <label className="block space-y-1.5 text-sm font-medium">
        Thinking
        <NativeSelect
          className="block w-full sm:w-1/2"
          disabled={saving || efforts.length === 0}
          value={selection.effort ?? ""}
          onChange={(e) => save({ ...selection, effort: e.target.value || null })}
        >
          <NativeSelectOption value="">{efforts.length ? "Engine default" : "Not available for this engine"}</NativeSelectOption>
          {efforts.map((level) => (
            <NativeSelectOption key={level} value={level}>
              {EFFORT_LABELS[level] ?? level}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <p className="text-xs text-muted-foreground">Saved on this agent&apos;s bot in BotTeam and used from its next message.</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
