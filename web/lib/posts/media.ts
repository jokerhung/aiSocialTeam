import "server-only";
import { getActiveCampaign } from "@/lib/campaigns";
import { api } from "@/lib/botteam";

// Image editing needs ImageKit, which this app doesn't use: the post editor offers no edit.
export function mediaCapabilities() {
  return { imageKit: false };
}

// Pictures are made by the Codex CLI or Gemini CLI chosen in the Creator agent's settings: whether one is ready
export async function imageGeneration(): Promise<{ ready: boolean; label: string | null }> {
  try {
    const campaign = await getActiveCampaign();
    if (!campaign) return { ready: false, label: null };
    const settings = await api<{ provider: string; tools: { id: string; label: string; installed: boolean }[] }>(`/api/social/campaigns/${campaign.id}/image-settings`);
    const tool = settings.tools.find((item) => item.id === settings.provider);
    return { ready: !!tool?.installed, label: tool?.label ?? null };
  } catch {
    return { ready: false, label: null };
  }
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
