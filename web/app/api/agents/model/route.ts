import { z } from "zod";
import { getActiveCampaign } from "@/lib/campaigns";
import { AGENT_ROLES } from "@/lib/agent-roles";
import { api, ApiError } from "@/lib/botteam";

import { getT } from "@/lib/i18n/server";
export const runtime = "nodejs";

const AGENT_IDS = ["master", ...AGENT_ROLES.map((role) => role.id)] as [string, ...string[]];

type Selection = { instanceId: string; model: string; effort: string | null };
type Instance = {
  id: string;
  displayName: string;
  enabled: boolean;
  hidden: boolean;
  snapshot: { state: string };
  models: { id: string; label: string }[];
  capabilities: { effortLevels?: string[] };
};

async function botIdFor(agentId: string) {
  const campaign = await getActiveCampaign();
  return campaign?.bots[agentId] ?? null;
}

// An agent's engine, model and thinking level (the BotTeam bot's model selection), and what it can be set to
export async function GET(request: Request) {
  const { t } = await getT();
  const parsed = z.enum(AGENT_IDS).safeParse(new URL(request.url).searchParams.get("agentId"));
  if (!parsed.success) return Response.json({ error: t("Invalid request") }, { status: 400 });
  const botId = await botIdFor(parsed.data);
  if (!botId) return Response.json({ error: t("No active campaign") }, { status: 400 });
  try {
    const [{ bots }, { instances }] = await Promise.all([
      api<{ bots: { id: string; modelSelection: Selection }[] }>("/api/bots"),
      api<{ instances: Instance[] }>("/api/instances"),
    ]);
    const bot = bots.find((b) => b.id === botId);
    if (!bot) return Response.json({ error: t("Agent not found") }, { status: 404 });
    const engines = instances
      .filter((i) => i.enabled && !i.hidden && (i.snapshot.state === "available" || i.id === bot.modelSelection.instanceId))
      .map((i) => ({ id: i.id, name: i.displayName, models: i.models, efforts: i.capabilities.effortLevels ?? [] }));
    return Response.json({ selection: bot.modelSelection, engines }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: error instanceof ApiError ? error.status : 502 });
  }
}

const Body = z.object({
  agentId: z.enum(AGENT_IDS),
  instanceId: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  effort: z.string().max(50).nullable(),
});

export async function PUT(request: Request) {
  const { t } = await getT();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: t("Invalid request") }, { status: 400 });
  const { agentId, instanceId, model, effort } = parsed.data;
  const botId = await botIdFor(agentId);
  if (!botId) return Response.json({ error: t("No active campaign") }, { status: 400 });
  try {
    await api(`/api/bots/${botId}`, { method: "PATCH", json: { modelSelection: { instanceId, model, effort } } });
    return Response.json({ selection: { instanceId, model, effort } });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: error instanceof ApiError ? error.status : 502 });
  }
}
