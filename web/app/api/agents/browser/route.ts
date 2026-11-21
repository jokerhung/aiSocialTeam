import { z } from "zod";
import { api, ApiError } from "@/lib/botteam";
import { browserTarget } from "@/lib/browser-api";
import { getT } from "@/lib/i18n/server";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("wake") }),
  z.object({ action: z.literal("sleep") }),
  z.object({ action: z.literal("control"), holder: z.enum(["bot", "person"]) }),
  z.object({ action: z.literal("approval"), id: z.string().max(80), behavior: z.enum(["allow", "deny"]) }),
  z.object({ action: z.literal("input"), event: z.discriminatedUnion("type", [
    z.object({ type: z.literal("click"), x: z.number().min(0).max(10000), y: z.number().min(0).max(10000) }),
    z.object({ type: z.literal("key"), key: z.string().min(1).max(40) }),
    z.object({ type: z.literal("text"), text: z.string().max(2000) }),
    z.object({ type: z.literal("scroll"), dy: z.number().min(-5000).max(5000) }),
    z.object({ type: z.literal("goto"), url: z.url({ protocol: /^https?$/ }).max(2048) }),
  ]) }),
]);

export async function GET(request: Request) {
  const { t } = await getT();
  const target = await browserTarget(request);
  if (!target) return Response.json({ error: t("Agent not found") }, { status: 404 });
  try {
    return Response.json(await api(target.path), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: t("Could not reach the browser.") }, { status: error instanceof ApiError ? error.status : 502 });
  }
}

export async function POST(request: Request) {
  const { t } = await getT();
  const target = await browserTarget(request);
  if (!target) return Response.json({ error: t("Agent not found") }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: t("Invalid request") }, { status: 400 });
  const value = body.data;
  const json = value.action === "input" ? value.event
    : value.action === "control" ? { holder: value.holder }
    : value.action === "approval" ? { id: value.id, behavior: value.behavior }
    : undefined;
  try {
    return Response.json(await api(`${target.path}/${value.action}`, { method: "POST", json }));
  } catch (error) {
    return Response.json({ error: t("Could not complete the browser action.") }, { status: error instanceof ApiError ? error.status : 502 });
  }
}
