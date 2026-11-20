import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// The reference app gave each agent a cloud desktop (E2B). Here the agents are BotTeam bots, whose browser is
// opened from BotTeam itself, so there is no desktop to show.
async function unavailable(extra: Record<string, unknown>) {
  const { t } = await getT();
  return Response.json({ ...extra, error: t("Agent computers aren't available here. Open the bot in BotTeam to use its browser.") }, { status: 404 });
}

export const GET = () => unavailable({ sandbox: null });
export const POST = () => unavailable({});
