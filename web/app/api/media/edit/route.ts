import { z } from "zod";
import { getActiveCampaign } from "@/lib/campaigns";
import { api, ApiError } from "@/lib/botteam";
import { getT } from "@/lib/i18n/server";
import { jsonError } from "@/lib/posts/media";
import type { PostMedia } from "@/lib/posts/shared";

export const runtime = "nodejs";
export const maxDuration = 360;

const Body = z.object({ url: z.string().min(1).max(2000), prompt: z.string().trim().min(3).max(900) });

// Changes one of the post's pictures as the person says, with the Codex CLI or Gemini CLI chosen in the Creator agent's
// settings. The original file stays; a new picture is returned.
export async function POST(request: Request) {
  const { t } = await getT();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(t("Invalid request"), 400);
  const campaign = await getActiveCampaign();
  if (!campaign) return jsonError(t("No active campaign"), 400);
  try {
    const made = await api<{ url: string }>("/api/social/images/edit", { method: "POST", json: { campaignId: campaign.id, ...parsed.data } });
    const stored = made.url.split("/").pop() ?? made.url;
    const media: PostMedia = {
      url: made.url,
      fileId: stored,
      name: parsed.data.prompt.slice(0, 40),
      mimeType: stored.endsWith(".jpg") || stored.endsWith(".jpeg") ? "image/jpeg" : stored.endsWith(".webp") ? "image/webp" : "image/png",
      origin: "edited",
      sourceUrl: parsed.data.url,
      prompt: parsed.data.prompt,
    };
    return Response.json({ media });
  } catch (error) {
    return jsonError((error as Error).message, error instanceof ApiError ? error.status : 502);
  }
}
