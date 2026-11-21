"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AgentRoleId } from "@/lib/agent-roles";
import type { AgentSurface, BrowserSettings, BrowserSettingsView } from "@/lib/browser-settings";
import { T, useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

const BROWSERS = { msedge: "Microsoft Edge", chrome: "Google Chrome", chromium: "Playwright Chromium" };
const TOGGLES = [
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
  const [confirm, setConfirm] = useState<"browser" | "computer">();
  const surface = settings?.surface ?? (settings?.enabled === false ? "off" : "browser");
  const computerAvailable = view?.computer?.status === "ready" && view.computer.engineSupported;

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
      const url = method === "DELETE" && confirm === "computer"
        ? `/api/agents/browser?campaignId=${campaignId}&agentId=${role}&surface=computer` : path;
      const response = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: method === "PUT" ? JSON.stringify(settings) : undefined,
      });
      if (!response.ok) throw new Error();
      if (method === "PUT") {
        const next = await response.json() as BrowserSettingsView;
        setView(next);
        setSettings(next.settings);
      } else if (confirm === "computer") {
        setView((previous) => previous?.computer ? { ...previous, computer: { ...previous.computer, hasMachine: false } } : previous);
      }
      setMessage(method === "PUT" ? "saved" : "cleared");
      setConfirm(undefined);
    } catch {
      setMessage("error");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-3 px-3">
      <h3 className="text-sm font-semibold"><T>Interface controls</T></h3>
      {settings && (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void update("PUT"); }}>
          <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <T>Interface mode</T>
            <select className="rounded-md border bg-background p-2" value={surface} disabled={pending} onChange={(event) => {
              const value = event.target.value as AgentSurface;
              setSettings({ ...settings, surface: value, enabled: value !== "off" });
            }}>
              <option value="browser">{t("Browser use")}</option>
              <option value="computer" disabled={!computerAvailable && surface !== "computer"}>{t("Computer use")}</option>
              <option value="off">{t("Off")}</option>
            </select>
          </label>
          {!computerAvailable && (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {view?.computer?.status === "ready" ? t("This engine cannot use computer tool images") : t("Check the E2B connection in Settings")}
              <Link href="/guides/e2b" className="text-primary underline underline-offset-4"><T>E2B setup guide</T></Link>
            </p>
          )}
          {surface === "browser" && <>
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
          </>}
          {surface === "computer" && (
            <div className="space-y-3">
              <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <T>New computer resolution</T>
                <select className="rounded-md border bg-background p-2" value={(settings.resolution ?? [1280, 800]).join("×")} disabled={pending} onChange={(event) => {
                  const [width, height] = event.target.value.split("×").map(Number);
                  setSettings({ ...settings, resolution: [width, height] });
                }}>
                  <option value="1280×800">1280×800</option>
                  <option value="1600×900">1600×900</option>
                  <option value="1920×1080">1920×1080</option>
                </select>
              </label>
              <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <T>Idle time in seconds</T>
                <input className="w-32 rounded-md border bg-background p-2" type="number" min={1} max={86400}
                  value={settings.idleSeconds ?? ""} placeholder={t("Use host default")} disabled={pending}
                  onChange={(event) => setSettings({ ...settings, idleSeconds: event.target.value ? Number(event.target.value) : null })} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <T>Allow commands in the virtual machine</T>
                <Switch checked={settings.runCommands === true} disabled={pending} onCheckedChange={(runCommands) => setSettings({ ...settings, runCommands })} />
              </label>
            </div>
          )}
          <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <T>Publish via</T>
            <select disabled={pending} value={settings.postVia} className="rounded-md border bg-background p-2"
              onChange={(event) => setSettings({ ...settings, postVia: event.target.value as BrowserSettings["postVia"] })}>
              <option value="composio">{t("Composio")}</option>
              <option value="web">{surface === "computer" ? t("Computer interface") : t("Web browser")}</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}><T>Save interface settings</T></Button>
            {surface === "browser" && <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirm("browser")}><T>Clear browser data</T></Button>}
            {view?.computer?.hasMachine && <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirm("computer")}><T>Remove virtual machine</T></Button>}
          </div>
        </form>
      )}
      {message && (
        <p role={message === "error" ? "alert" : "status"} className="text-sm">
          {message === "error" ? t("Could not update interface settings.") : message === "saved" ? t("Interface settings saved.") : t("Data removed.")}
        </p>
      )}
      <Dialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(undefined); }}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>{confirm === "computer" ? t("Remove virtual machine") : t("Clear browser data")}</DialogTitle>
          <DialogDescription>{confirm === "computer" ? t("This removes the virtual machine and its saved sign-ins and files.") : t("This removes the cookies, saved sign-ins, and browsing data for this agent.")}</DialogDescription>
          {message === "error" && <p role="alert" className="text-sm text-destructive"><T>Could not update browser settings.</T></p>}
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button variant="outline" disabled={pending} />}><T>Cancel</T></DialogClose>
            <Button variant="destructive" disabled={pending} onClick={() => update("DELETE")}>{confirm === "computer" ? t("Remove virtual machine") : t("Clear browser data")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
