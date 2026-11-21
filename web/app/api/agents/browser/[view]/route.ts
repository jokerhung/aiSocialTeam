import { BOTTEAM_API } from "@/lib/botteam";
import { browserTarget } from "@/lib/browser-api";
import { getT } from "@/lib/i18n/server";

export async function GET(request: Request, context: { params: Promise<{ view: string }> }) {
  const { t } = await getT();
  const { view } = await context.params;
  const target = await browserTarget(request);
  if (!target || (view !== "watch" && view !== "screen")) {
    return Response.json({ error: t("Could not reach the browser.") }, { status: 404 });
  }
  try {
    const upstream = await fetch(`${BOTTEAM_API}${target.path}/${view}`, { cache: "no-store", signal: request.signal });
    if (!upstream.ok) return Response.json({ error: t("Could not reach the browser.") }, { status: upstream.status });
    return new Response(upstream.body, {
      headers: { "Content-Type": view === "watch" ? "text/event-stream" : "image/jpeg", "Cache-Control": "no-store, no-transform" },
    });
  } catch {
    return Response.json({ error: t("Could not reach the browser.") }, { status: 502 });
  }
}
