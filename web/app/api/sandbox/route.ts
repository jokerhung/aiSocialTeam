export const runtime = "nodejs";

// The reference app gave each agent a cloud desktop (E2B). Here the agents are BotTeam bots, whose browser is
// opened from BotTeam itself, so there is no desktop to show.
const body = { error: "Agent computers aren't available here. Open the bot in BotTeam to use its browser." };
export const GET = () => Response.json({ sandbox: null, ...body }, { status: 404 });
export const POST = () => Response.json(body, { status: 404 });
