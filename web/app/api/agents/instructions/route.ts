import { z } from "zod";
import { getActiveCampaign } from "@/lib/campaigns";
import { AGENT_ROLES } from "@/lib/agent-roles";
import { api, ApiError } from "@/lib/botteam";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

const AGENT_IDS = ["master", ...AGENT_ROLES.map((role) => role.id)] as [string, ...string[]];

async function botIdFor(agentId: string) {
  return (await getActiveCampaign())?.bots[agentId] ?? null;
}

// An agent's instructions are the instructions (soul) of its BotTeam bot: what the team's setup wrote, what the person typed
// here, and what the agent saved when asked to remember something.
export async function GET(request: Request) {
  const { t } = await getT();
  const parsed = z.enum(AGENT_IDS).safeParse(new URL(request.url).searchParams.get("agentId"));
  if (!parsed.success) return Response.json({ error: t("Invalid request") }, { status: 400 });
  const botId = await botIdFor(parsed.data);
  if (!botId) return Response.json({ error: t("No active campaign") }, { status: 400 });
  try {
    const { bots } = await api<{ bots: { id: string; soul?: string }[] }>("/api/bots");
    const bot = bots.find((item) => item.id === botId);
    if (!bot) return Response.json({ error: t("Agent not found") }, { status: 404 });
    return Response.json({ instructions: bot.soul ?? "" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: error instanceof ApiError ? error.status : 502 });
  }
}

const Body = z.object({ agentId: z.enum(AGENT_IDS), instructions: z.string().max(20000) });

export async function PUT(request: Request) {
  const { t } = await getT();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: t("Invalid request") }, { status: 400 });
  const botId = await botIdFor(parsed.data.agentId);
  if (!botId) return Response.json({ error: t("No active campaign") }, { status: 400 });
  try {
    await api(`/api/bots/${botId}`, { method: "PATCH", json: { soul: parsed.data.instructions } });
    return Response.json({ instructions: parsed.data.instructions });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: error instanceof ApiError ? error.status : 502 });
  }
}
