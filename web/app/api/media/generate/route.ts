import { z } from "zod";
import { getActiveCampaign } from "@/lib/campaigns";
import { api, ApiError } from "@/lib/botteam";
import { getT } from "@/lib/i18n/server";
import { jsonError } from "@/lib/posts/media";
import type { PostMedia } from "@/lib/posts/shared";

export const runtime = "nodejs";
export const maxDuration = 360;

// The picture is made from the whole post; the person only adds the style or other instructions
const Body = z.object({
  style: z.string().trim().max(600).default(""),
  post: z.object({ title: z.string().trim().min(1).max(200), caption: z.string().max(5000), hashtags: z.array(z.string().max(80)).max(60) }),
  aspect: z.enum(["square", "vertical", "portrait", "landscape"]),
});

function briefFor({ style, post }: z.infer<typeof Body>) {
  return [
    "Make one eye-catching picture to go with this social-media post. Show what the post is about; do not copy its text into the picture.",
    `Title: ${post.title}`,
    post.caption.trim() ? `Text: ${post.caption.trim().slice(0, 1500)}` : "",
    post.hashtags.length ? `Hashtags: ${post.hashtags.slice(0, 10).join(" ")}` : "",
    style ? `Style and instructions from the person (follow these): ${style}` : "A clean, modern, editorial look that fits the topic.",
  ]
    .filter(Boolean)
    .join("\n");
}

// Makes a picture with the Codex CLI or Gemini CLI chosen in the Creator agent's settings (the server runs it)
export async function POST(request: Request) {
  const { t } = await getT();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(t("Invalid request"), 400);
  const campaign = await getActiveCampaign();
  if (!campaign) return jsonError(t("No active campaign"), 400);
  const prompt = briefFor(parsed.data);
  try {
    const made = await api<{ url: string }>("/api/social/images", { method: "POST", json: { campaignId: campaign.id, prompt, aspect: parsed.data.aspect } });
    const stored = made.url.split("/").pop() ?? made.url;
    const media: PostMedia = {
      url: made.url, // relative: the browser reaches the web app by whatever name it was opened with
      fileId: stored,
      name: parsed.data.post.title.slice(0, 40),
      mimeType: stored.endsWith(".jpg") || stored.endsWith(".jpeg") ? "image/jpeg" : stored.endsWith(".webp") ? "image/webp" : "image/png",
      origin: "generated",
      prompt: parsed.data.style || null,
    };
    return Response.json({ media });
  } catch (error) {
    return jsonError((error as Error).message, error instanceof ApiError ? error.status : 502);
  }
}
