import { api, ApiError } from "@/lib/botteam";
import { browserTarget } from "@/lib/browser-api";
import { BrowserSettingsSchema } from "@/lib/browser-settings";
import { getT } from "@/lib/i18n/server";

async function settingsRequest(request: Request, method: "GET" | "PUT" | "DELETE") {
  const { t } = await getT();
  const target = await browserTarget(request);
  if (!target) {
    return Response.json({ error: t("Agent not found") }, { status: 404 });
  }
  let json: unknown;
  if (method === "PUT") {
    const parsed = BrowserSettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: t("Invalid request") }, { status: 400 });
    json = parsed.data;
  }
  try {
    const suffix = method === "DELETE" ? "/profile" : "";
    const result = await api(`/api/social/campaigns/${target.campaignId}/browser-settings${suffix}?role=${target.role}`, { method, json });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: t("Could not update browser settings.") }, { status: error instanceof ApiError ? error.status : 502 });
  }
}

export function GET(request: Request) { return settingsRequest(request, "GET"); }
export function PUT(request: Request) { return settingsRequest(request, "PUT"); }
export function DELETE(request: Request) { return settingsRequest(request, "DELETE"); }
