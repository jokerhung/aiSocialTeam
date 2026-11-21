import "server-only";
import { api } from "@/lib/botteam";
import type { AgentRoleId } from "@/lib/agent-roles";
import type { Campaign } from "@/lib/campaigns";

// How many messages the chat loads at a time (first open, then each scroll to the top)
export const CHAT_PAGE_SIZE = 10;

// What the client receives. Each agent is a BotTeam bot; its conversation is the bot's main thread. A message's
// id is its time in milliseconds, so ids are numbers that grow (the chat pages and syncs by them).
// assignedBy: the bot that handed this text to the agent as a job (the Master Agent), so it is shown as an assignment, not as the person's own message
export type StoredChatMessage = { id: string; from: "user" | "agent"; text: string; createdAt: string; failed?: boolean; assignedBy?: string };

type WireMessage = { id: string; role: "bot" | "user"; kind: string; text: string; at: number; streaming?: boolean; assignedBy?: string };
type WireTask = { threadId: string; title: string; main: boolean; at: number };
type WireBot = { id: string; busy: boolean; activity: string; statusLine: string | null; name: string; tasks?: WireTask[] };

export function botIdFor(campaign: Campaign, agentId: AgentRoleId | string) {
  return campaign.bots[agentId] ?? null;
}

// The text of a job another bot handed over: BotTeam puts a header line and a fixed sentence before the brief itself
function withoutHandoffHeader(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line, i) => !(i === 0 && line.startsWith("[From @")) && !line.startsWith("This is your task;"))
    .join(String.fromCharCode(10))
    .trim();
}

// "[From @Master Agent · Ai news daily (bot) · assignment …]" → "Master Agent"
function assignerOf(text: string) {
  return /^\[From @([^·(\]]+)/.exec(text)?.[1]?.trim() || undefined;
}

const SHOWN_JOBS = 3;

async function messagesOf(botId: string, threadId?: string): Promise<WireMessage[]> {
  const { messages } = await api<{ messages: WireMessage[] }>(`/api/bots/${botId}/messages${threadId ? `?thread=${encodeURIComponent(threadId)}` : ""}`);
  return messages.filter((m) => (m.kind === "text" || m.kind === "error") && m.text.trim() && !m.streaming);
}

// The conversation, oldest first: what the person and the bot said (no tool lines, notices or cut-off drafts), and the
// last jobs other bots handed to it (the Master Agent's assignments), which run in their own conversations
async function thread(botId: string): Promise<WireMessage[]> {
  const [main, bots] = await Promise.all([messagesOf(botId), api<{ bots: WireBot[] }>("/api/bots").catch(() => ({ bots: [] as WireBot[] }))]);
  const jobs = (bots.bots.find((b) => b.id === botId)?.tasks ?? []).filter((task) => !task.main && task.title).sort((a, b) => b.at - a.at).slice(0, SHOWN_JOBS);
  const fromJobs = await Promise.all(
    jobs.map(async (job) => (await messagesOf(botId, job.threadId).catch(() => [])).map((m) => (m.role === "user" ? { ...m, assignedBy: assignerOf(m.text), text: withoutHandoffHeader(m.text) } : m)))
  );
  return [...main, ...fromJobs.flat()].filter((m) => m.text.trim()).sort((a, b) => a.at - b.at);
}

function toStored(m: WireMessage): StoredChatMessage {
  return { id: String(m.at), from: m.role === "user" ? "user" : "agent", text: m.text, createdAt: new Date(m.at).toISOString(), ...(m.kind === "error" && { failed: true }), ...(m.assignedBy && { assignedBy: m.assignedBy }) };
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

// The newest message id of every agent's conversation, so open chats can pick up what arrived in the background
export async function getLatestChatMessageIds(campaign: Campaign) {
  const entries = await Promise.all(Object.entries(campaign.bots).map(async ([role, botId]) => [role, await getLatestChatMessageId(botId).catch(() => 0)] as const));
  return Object.fromEntries(entries) as Record<string, number>;
}
