import "server-only";
import { api } from "@/lib/botteam";
import type { AgentRoleId } from "@/lib/agent-roles";
import type { Campaign } from "@/lib/campaigns";

// How many messages the chat loads at a time (first open, then each scroll to the top)
export const CHAT_PAGE_SIZE = 10;

// What the client receives. Each agent is a BotTeam bot; its conversation is the bot's main thread. A message's
// id is its time in milliseconds, so ids are numbers that grow (the chat pages and syncs by them).
export type StoredChatMessage = { id: string; from: "user" | "agent"; text: string; createdAt: string; failed?: boolean };

type WireMessage = { id: string; role: "bot" | "user"; kind: string; text: string; at: number; streaming?: boolean };
type WireBot = { id: string; busy: boolean; activity: string; statusLine: string | null; name: string };

export function botIdFor(campaign: Campaign, agentId: AgentRoleId | string) {
  return campaign.bots[agentId] ?? null;
}

// The conversation, oldest first: only what the person and the bot said (no tool lines, notices or cut-off drafts)
async function thread(botId: string): Promise<WireMessage[]> {
  const { messages } = await api<{ messages: WireMessage[] }>(`/api/bots/${botId}/messages`);
  return messages.filter((m) => (m.kind === "text" || m.kind === "error") && m.text.trim() && !m.streaming);
}

function toStored(m: WireMessage): StoredChatMessage {
  return { id: String(m.at), from: m.role === "user" ? "user" : "agent", text: m.text, createdAt: new Date(m.at).toISOString(), ...(m.kind === "error" && { failed: true }) };
}

// A page ending just before `before` (or at the newest message); nextCursor is the id for the next older page
export async function listChatMessages(botId: string, { before, limit = CHAT_PAGE_SIZE }: { before?: number; limit?: number } = {}) {
  const all = (await thread(botId)).filter((m) => (before ? m.at < before : true));
  const page = all.slice(-limit);
  return { messages: page.map(toStored), nextCursor: all.length > limit ? (page[0]?.at ?? null) : null };
}

export async function listChatMessagesAfter(botId: string, after: number, limit = 50) {
  return (await thread(botId)).filter((m) => m.at > after).slice(0, limit).map(toStored);
}

export async function getLatestChatMessageId(botId: string) {
  return (await thread(botId)).at(-1)?.at ?? 0;
}

export async function getBot(botId: string) {
  return (await api<{ bots: WireBot[] }>("/api/bots")).bots.find((b) => b.id === botId) ?? null;
}

export async function listBots() {
  return (await api<{ bots: WireBot[] }>("/api/bots")).bots;
}

export async function sendToBot(botId: string, text: string) {
  return (await api<{ message: WireMessage }>(`/api/bots/${botId}/messages`, { method: "POST", json: { text } })).message;
}

// The bot's reply to a message as it grows: the text of what it said after `since`
export async function replyText(botId: string, since: number) {
  const messages = (await api<{ messages: WireMessage[] }>(`/api/bots/${botId}/messages`)).messages;
  return messages.filter((m) => m.role === "bot" && m.kind === "text" && m.at >= since).map((m) => m.text).join("\n\n");
}
