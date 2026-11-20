import { z } from "zod";
import { getActiveCampaign } from "@/lib/campaigns";
import { AGENT_ROLES } from "@/lib/agent-roles";
import { botIdFor, CHAT_PAGE_SIZE, getBot, listChatMessages, listChatMessagesAfter, replyText, sendToBot } from "@/lib/agent-chats";
import { ApiError } from "@/lib/botteam";

import { getT } from "@/lib/i18n/server";
export const runtime = "nodejs";
export const maxDuration = 300;

// The Master Agent plus every worker agent: each is a BotTeam bot of the campaign
const CHAT_AGENT_IDS = ["master", ...AGENT_ROLES.map((role) => role.id)] as [string, ...string[]];

const MAX_MESSAGE_LENGTH = 4000;
const POLL_MS = 350;

const ChatRequest = z.object({
  agentId: z.enum(CHAT_AGENT_IDS),
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  instructions: z.string().max(2000).optional(),
});

const HistoryQuery = z.object({
  agentId: z.enum(CHAT_AGENT_IDS),
  before: z.coerce.number().int().positive().optional(),
  // Newer messages only (ids above this), for picking up what the Master Agent posted in the background
  after: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(CHAT_PAGE_SIZE),
});

async function botFor(agentId: string) {
  const campaign = await getActiveCampaign();
  return campaign ? botIdFor(campaign, agentId) : null;
}

// A page of the saved chat with an agent: ?agentId=research[&before=<message id>][&limit=10],
// or everything newer than a message: ?agentId=master&after=<message id>
export async function GET(request: Request) {
  const { t } = await getT();
  const parsed = HistoryQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: t("Invalid request") }, { status: 400 });
  const { agentId, before, after, limit } = parsed.data;

  const botId = await botFor(agentId);
  if (!botId) return Response.json({ error: t("No active campaign") }, { status: 400 });
  try {
    const body = after !== undefined ? { messages: await listChatMessagesAfter(botId, after) } : await listChatMessages(botId, { before, limit });
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: error instanceof ApiError ? error.status : 502 });
  }
}

// Sends the person's message to the agent's bot, then streams the reply as plain text while the bot writes it
export async function POST(request: Request) {
  const { t } = await getT();
  const parsed = ChatRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: t("Invalid request") }, { status: 400 });
  const { agentId, text, instructions } = parsed.data;

  const botId = await botFor(agentId);
  if (!botId) return Response.json({ error: t("No active campaign") }, { status: 400 });

  let sent;
  try {
    // The per-agent instructions typed in the agent's Settings tab go along with the message
    sent = await sendToBot(botId, instructions?.trim() ? `${text}\n\n(Standing instructions from the person: ${instructions.trim()})` : text);
  } catch (error) {
    const message = error instanceof ApiError && error.status === 409 ? t("That agent is still answering. Wait a moment and try again.") : (error as Error).message;
    return Response.json({ error: message }, { status: 502 });
  }

  const signal = request.signal;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sentChars = 0;
      let quiet = 0;
      try {
        while (!signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          const [reply, bot] = await Promise.all([replyText(botId, sent.at), getBot(botId)]);
          if (reply.length > sentChars) {
            controller.enqueue(encoder.encode(reply.slice(sentChars)));
            sentChars = reply.length;
          }
          // Done once the bot is no longer busy and nothing new arrived for a couple of polls
          quiet = bot?.busy ? 0 : quiet + 1;
          if (quiet >= 2) break;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
