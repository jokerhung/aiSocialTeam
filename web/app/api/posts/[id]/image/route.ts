import { api, ApiError } from "@/lib/botteam";
import { jsonError } from "@/lib/posts/media";

export const runtime = "nodejs";
export const maxDuration = 360;

// Makes a picture for a post that has none (the Codex CLI or Gemini CLI chosen in the Creator agent's settings) and adds it
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return jsonError("Invalid request", 400);
  try {
    return Response.json({ post: await api(`/api/social/posts/${id}/image`, { method: "POST", json: {} }) });
  } catch (error) {
    return jsonError((error as Error).message, error instanceof ApiError ? error.status : 502);
  }
}
