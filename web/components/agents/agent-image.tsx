"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { T, useT } from "@/lib/i18n/client";

type Tool = { id: string; label: string; installed: boolean; version: string | null };
type State = { provider: string; model: string; tools: Tool[] };

// Which command-line tool makes the Creator's pictures (Codex CLI or Gemini CLI): saved per campaign on the server
export function AgentImagePicker() {
  const t = useT();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stale = false;
    fetch("/api/agents/image-settings", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body) throw new Error(body?.error ?? t("Couldn't load the image settings."));
        if (!stale) setState(body);
      })
      .catch((e: Error) => !stale && setError(e.message));
    return () => {
      stale = true;
    };
  }, []);

  async function save(provider: string, model: string) {
    if (!state) return;
    const previous = state;
    setState({ ...state, provider, model });
    setSaving(true);
    setError(null);
    const response = await fetch("/api/agents/image-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model }),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      setState(previous);
      setError(body?.error ?? t("Couldn't save. Please try again."));
    }
  }

  if (error && !state) return <p className="px-3 text-xs text-destructive">{error}</p>;
  if (!state) return <p className="px-3 text-xs text-muted-foreground"><T>Loading image settings…</T></p>;

  const chosen = state.tools.find((tool) => tool.id === state.provider);
  return (
    <div className="space-y-3 px-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">
          <T>Image tool</T>
          <NativeSelect className="block w-full" disabled={saving} value={state.provider} onChange={(e) => save(e.target.value, state.model)}>
            <NativeSelectOption value="">{t("None (no image generation)")}</NativeSelectOption>
            {state.tools.map((tool) => (
              <NativeSelectOption key={tool.id} value={tool.id}>
                {tool.installed ? `${tool.label}${tool.version ? ` · ${tool.version}` : ""}` : t("{tool} (not installed)", { tool: tool.label })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          <T>Model (optional)</T>
          <Input
            key={state.provider}
            disabled={saving || !state.provider}
            defaultValue={state.model}
            placeholder={t("Tool default")}
            onBlur={(e) => e.target.value.trim() !== state.model && save(state.provider, e.target.value.trim())}
          />
        </label>
      </div>
      {chosen && !chosen.installed && (
        <p className="text-xs text-amber-700 dark:text-amber-300">{t("{tool} isn't installed on this computer, so no pictures can be made until it is.", { tool: chosen.label })}</p>
      )}
      <p className="text-xs text-muted-foreground">
        <T>The Creator and the post editor run this tool on this computer to make pictures, with the account you already signed it in with — no API key is needed here. Gemini CLI needs an image extension installed.</T>
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
