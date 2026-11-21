import { z } from "zod";
import { getActiveCampaign } from "@/lib/campaigns";
import { api, ApiError } from "@/lib/botteam";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// Which command-line tool (Codex CLI or Gemini CLI) makes the pictures for the active campaign, and which tools are installed
export async function GET() {
  const { t } = await getT();
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: t("No active campaign") }, { status: 400 });
  try {
    return Response.json(await api(`/api/social/campaigns/${campaign.id}/image-settings`), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: error instanceof ApiError ? error.status : 502 });
  }
}

const Body = z.object({ provider: z.enum(["", "codex", "gemini"]), model: z.string().max(100) });

export async function PUT(request: Request) {
  const { t } = await getT();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: t("Invalid request") }, { status: 400 });
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: t("No active campaign") }, { status: 400 });
  try {
    return Response.json(await api(`/api/social/campaigns/${campaign.id}/image-settings`, { method: "PUT", json: parsed.data }));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: error instanceof ApiError ? error.status : 502 });
  }
}
