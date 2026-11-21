"use client";

import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceAgent } from "@/components/agents/agent-workspace";
import { AgentModelPicker } from "@/components/agents/agent-model";
import { AgentImagePicker } from "@/components/agents/agent-image";
import { BrowserSettingsForm } from "@/components/browser/browser-settings";

import { T, useT } from "@/lib/i18n/client";
export type AgentSettings = {
  autonomous: boolean;
  approval: boolean;
  notify: boolean;
  instructions: string;
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = { autonomous: true, approval: true, notify: true, instructions: "" };

const TOGGLES: { key: "autonomous" | "approval" | "notify"; label: string; description: string }[] = [
  { key: "autonomous", label: "Work autonomously", description: "Pick up new work for the campaign without waiting for a task" },
  { key: "approval", label: "Ask before acting", description: "Check with you before anything goes out to your accounts" },
  { key: "notify", label: "Notify me", description: "Send a notification when a task is finished" },
];

export function AgentSettingsForm({
  campaignId,
  agent,
  settings,
  onChange,
}: {
  campaignId: number;
  agent: WorkspaceAgent;
  settings: AgentSettings;
  onChange: (settings: AgentSettings) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-3 text-sm font-semibold"><T>Model</T></h3>
      <AgentModelPicker roleId={agent.role.id} />
      {agent.role.id === "creator" && (
        <>
          <h3 className="mt-3 px-3 text-sm font-semibold"><T>Image generation</T></h3>
          <AgentImagePicker />
        </>
      )}
      <div className="my-2 border-t" />
      <BrowserSettingsForm campaignId={campaignId} role={agent.role.id} />
      <div className="my-2 border-t" />
      {TOGGLES.map(({ key, label, description }) => (
        <label key={key} className="flex cursor-pointer items-center gap-4 rounded-2xl p-3 transition-colors hover:bg-muted/60">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t(label)}</span>
            <span className="block text-xs text-muted-foreground">{t(description)}</span>
          </span>
          <Switch checked={settings[key]} onCheckedChange={(checked) => onChange({ ...settings, [key]: checked })} />
        </label>
      ))}

      <div className="mt-2 space-y-2 px-3">
        <label htmlFor="agent-instructions" className="block text-sm font-medium">
          <T>Instructions</T>
        </label>
        <Textarea
          id="agent-instructions"
          value={settings.instructions}
          onChange={(event) => onChange({ ...settings, instructions: event.target.value })}
          placeholder={t("Anything the {name} should always keep in mind — tone, topics to avoid, sources to trust…", { name: t(agent.role.name) })}
          className="min-h-28 rounded-xl"
        />
      </div>
    </div>
  );
}
