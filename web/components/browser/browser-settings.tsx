"use client";

import { useEffect, useState } from "react";
import type { AgentRoleId } from "@/lib/agent-roles";
import type { BrowserSettings, BrowserSettingsView } from "@/lib/browser-settings";
import { T, useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

const BROWSERS = { msedge: "Microsoft Edge", chrome: "Google Chrome", chromium: "Playwright Chromium" };
const TOGGLES = [
  { key: "enabled", label: "Enable browser" },
  { key: "headed", label: "Show browser window" },
  { key: "allowLocal", label: "Allow local addresses" },
  { key: "allowDownloads", label: "Allow downloads" },
] as const;

export function BrowserSettingsForm({ campaignId, role }: { campaignId: number; role: AgentRoleId }) {
  const t = useT();
  const path = `/api/agents/browser-settings?campaignId=${campaignId}&agentId=${role}`;
  const [view, setView] = useState<BrowserSettingsView>();
  const [settings, setSettings] = useState<BrowserSettings>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<"error" | "saved" | "cleared">();
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(path, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const next = await response.json() as BrowserSettingsView;
      if (controller.signal.aborted) return;
      setView(next);
      setSettings(next.settings);
    }).catch(() => {
      if (!controller.signal.aborted) setMessage("error");
    });
    return () => controller.abort();
  }, [path]);

  async function update(method: "PUT" | "DELETE") {
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch(path, {
        method, headers: { "Content-Type": "application/json" },
        body: method === "PUT" ? JSON.stringify(settings) : undefined,
      });
      if (!response.ok) throw new Error();
      if (method === "PUT") {
        const next = await response.json() as BrowserSettingsView;
        setView(next);
        setSettings(next.settings);
      }
      setMessage(method === "PUT" ? "saved" : "cleared");
      setConfirm(false);
    } catch {
      setMessage("error");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-3 px-3">
      <h3 className="text-sm font-semibold"><T>Browser</T></h3>
      {settings && (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void update("PUT"); }}>
          {TOGGLES.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm">
              {t(label)}
              <Switch checked={settings[key]} disabled={pending} onCheckedChange={(checked) => setSettings({ ...settings, [key]: checked })} />
            </label>
          ))}
          <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <T>Browser</T>
            <select disabled={pending} value={settings.browser} className="rounded-md border bg-background p-2"
              onChange={(event) => setSettings({ ...settings, browser: event.target.value as BrowserSettings["browser"] })}>
              <option value="auto">{t("Auto (Edge, Chrome, Chromium)")}</option>
              <option value="msedge">{t("Microsoft Edge")}</option>
              <option value="chrome">{t("Google Chrome")}</option>
            </select>
          </label>
          {view?.availability.installed?.length ? (
            <p className="text-xs text-muted-foreground">
              {t("Installed browsers: {browsers}", {
                browsers: view.availability.installed.map((key) => [
                  t(BROWSERS[key as keyof typeof BROWSERS] ?? key),
                  view.availability.versions?.[key],
                ].filter(Boolean).join(" ")).join(", "),
              })}
            </p>
          ) : <p className="text-xs text-muted-foreground"><T>No browser detected</T></p>}
          {view?.availability.mcpAvailable === false && (
            <p className="text-xs text-destructive"><T>Install Node.js 20 or newer with npx for Playwright MCP.</T></p>
          )}
          <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <T>Publish via</T>
            <select disabled={pending} value={settings.postVia} className="rounded-md border bg-background p-2"
              onChange={(event) => setSettings({ ...settings, postVia: event.target.value as BrowserSettings["postVia"] })}>
              <option value="composio">{t("Composio")}</option>
              <option value="web">{t("Web browser")}</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}><T>Save browser settings</T></Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirm(true)}><T>Clear browser data</T></Button>
          </div>
        </form>
      )}
      {message && (
        <p role={message === "error" ? "alert" : "status"} className="text-sm">
          {message === "error" ? t("Could not update browser settings.") : message === "saved" ? t("Browser settings saved.") : t("Browser data cleared.")}
        </p>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent showCloseButton={false}>
          <DialogTitle><T>Clear browser data</T></DialogTitle>
          <DialogDescription><T>This removes the cookies, saved sign-ins, and browsing data for this agent.</T></DialogDescription>
          {message === "error" && <p role="alert" className="text-sm text-destructive"><T>Could not update browser settings.</T></p>}
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button variant="outline" disabled={pending} />}><T>Cancel</T></DialogClose>
            <Button variant="destructive" disabled={pending} onClick={() => update("DELETE")}><T>Clear browser data</T></Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
