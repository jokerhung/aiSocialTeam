import { z } from "zod";
import { api, ApiError } from "@/lib/botteam";
import { getT } from "@/lib/i18n/server";

const Host = z.object({
  source: z.enum(["cloud", "embed", "opensandbox"]),
  apiUrl: z.string().max(2048),
  sandboxUrl: z.string().max(2048),
  domain: z.string().max(256),
  template: z.string().max(256),
  image: z.string().max(256).optional(),
  apiKey: z.string().max(512).optional(),
  maxMachines: z.number().int().min(1).max(32),
  idleSeconds: z.number().int().min(1).max(86400),
});

export async function GET() {
  const { t } = await getT();
  try {
    return Response.json(await api("/api/computer/host"), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: t("Could not reach the computer host.") }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { t } = await getT();
  const patch = Host.safeParse(await request.json().catch(() => null));
  if (!patch.success) return Response.json({ error: t("Invalid request") }, { status: 400 });
  try {
    await api("/api/computer/host", { method: "PUT", json: patch.data });
    return Response.json(await api("/api/computer/host/test", { method: "POST" }));
  } catch (error) {
    const message = error instanceof ApiError && error.message === "Delete existing computers before changing the computer host"
      ? t("Delete existing computers before changing the computer host") : t("Could not save computer host settings.");
    return Response.json({ error: message }, { status: error instanceof ApiError ? error.status : 502 });
  }
}
