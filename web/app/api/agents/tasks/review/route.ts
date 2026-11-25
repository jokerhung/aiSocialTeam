import { z } from "zod";
import { getActiveCampaign } from "@/lib/campaigns";
import { api, ApiError } from "@/lib/botteam";
import { listCampaignAssignments } from "@/lib/team-work";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

const Body = z.object({
  assignmentId: z.string().regex(/^as_[0-9a-f]+$/),
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(2000).default(""),
});

// The person's decision on work that waits for their review (BotTeam holds it until this arrives)
export async function POST(request: Request) {
  const { t } = await getT();
  // Asking for JSON makes another website's request need a preflight, which this route does not grant
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: t("Invalid request") }, { status: 415 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: t("Invalid request") }, { status: 400 });
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: t("No active campaign") }, { status: 400 });
  const { assignmentId, decision, note } = parsed.data;
  try {
    const mine = (await listCampaignAssignments(campaign)).some((a) => a.id === assignmentId);
    if (!mine) return Response.json({ error: t("Task not found") }, { status: 404 });
    await api(`/api/assignments/${assignmentId}/review`, { method: "POST", json: { decision, note } });
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 502;
    const message = status === 409 ? t("This work is no longer waiting for your review.") : (error as Error).message;
    return Response.json({ error: message }, { status });
  }
}
