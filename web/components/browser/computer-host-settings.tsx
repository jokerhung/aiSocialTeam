"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T, useT } from "@/lib/i18n/client";

type Capabilities = { pause?: string; persistentLogin?: string; egressPolicy?: boolean; isolation?: string };
type Host = {
  source: "cloud" | "embed" | "opensandbox";
  apiUrl: string;
  sandboxUrl: string;
  domain: string;
  template: string;
  image: string;
  maxMachines: number;
  idleSeconds: number;
  status: string;
  keySet: boolean;
  keyHint: string | null;
  capabilities?: Capabilities;
};

const STATUS = {
  ready: "Computer host ready",
  unauthorized: "Check the API key.",
  unreachable: "Could not reach the computer host.",
  no_template: "A ready desktop template is required.",
  no_image: "The desktop image was not found on the server. Build it as the setup guide says.",
  no_desktop_tools: "The desktop image is missing the computer tools. Rebuild it as the setup guide says.",
  no_egress_policy: "The server cannot limit the computer's network access.",
  unchecked: "Check the computer host connection in Settings",
} as const;
const PAUSE = {
  snapshot: "Pausing keeps open windows and the sign-ins.",
  freeze: "Pausing freezes the machine in place; if the server cannot do that, a new machine is made on the next use.",
  none: "An idle machine is removed and a new one is made on the next use.",
} as const;
const ISOLATION = {
  vm: "Each computer is a virtual machine.",
  gvisor: "Each computer is a gVisor container.",
  container: "Each computer is a container: pages it opens are held back only by the container. Turn on gVisor or Kata in the OpenSandbox server for stronger isolation.",
} as const;
const INPUT = "min-w-0 rounded-md border bg-background px-3 py-2";

export function ComputerHostSettings() {
  const t = useT();
  const [host, setHost] = useState<Host>();
  const [key, setKey] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/computer/host", { signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const saved = await response.json() as Host;
      if (!abort.signal.aborted) setHost(saved);
    }).catch(() => { if (!abort.signal.aborted) setError(t("Could not reach the computer host.")); });
    return () => abort.abort();
  }, [t]);

  function change<K extends keyof Host>(field: K, value: Host[K]) {
    setHost((previous) => previous ? { ...previous, [field]: value, status: "unchecked" } : previous);
  }

  async function test() {
    if (!host) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/computer/host", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...host, apiKey: key.trim() || undefined }),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error);
      setHost(next as Host);
      setKey("");
      setEditingKey(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Could not save computer host settings."));
    } finally {
      setPending(false);
    }
  }

  const opensandbox = host?.source === "opensandbox";
  const capabilities = host?.capabilities;

  return (
    <section className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold"><T>Computer host</T></h3>
        <Link href={opensandbox ? "/guides/opensandbox" : "/guides/e2b"} className="text-sm text-primary underline-offset-4 hover:underline">
          {opensandbox ? t("OpenSandbox setup guide") : t("E2B setup guide")}
        </Link>
      </div>
      {host && (
        <form className="space-y-3 text-sm" onSubmit={(event) => { event.preventDefault(); void test(); }}>
          <label className="grid gap-1.5">
            <T>Computer provider</T>
            <select className={INPUT} value={host.source} disabled={pending} onChange={(event) => {
              const source = event.target.value as Host["source"];
              setHost({ ...host, source, apiUrl: "", sandboxUrl: "", domain: "", status: "unchecked", keySet: false, keyHint: null, capabilities: undefined });
              setKey("");
              setEditingKey(false);
            }}>
              <option value="cloud">{t("E2B Cloud")}</option>
              <option value="embed">{t("Self-hosted E2B")}</option>
              <option value="opensandbox">{t("OpenSandbox (Docker)")}</option>
            </select>
          </label>
          {host.source === "cloud" ? (
            <p className="text-xs text-muted-foreground"><T>E2B Cloud receives screenshots and virtual machine content.</T>{" "}<T>Usage limits depend on your E2B plan.</T></p>
          ) : opensandbox ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5"><T>OpenSandbox server URL</T><input className={INPUT} type="url" value={host.apiUrl} required disabled={pending} placeholder="http://server:8080" onChange={(event) => change("apiUrl", event.target.value)} /></label>
              <label className="grid gap-1.5"><T>Desktop image</T><input className={INPUT} value={host.image} required disabled={pending} onChange={(event) => change("image", event.target.value)} /></label>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5"><T>E2B API URL</T><input className={INPUT} type="url" value={host.apiUrl} required disabled={pending} onChange={(event) => change("apiUrl", event.target.value)} /></label>
              <label className="grid gap-1.5"><T>E2B sandbox proxy URL</T><input className={INPUT} type="url" value={host.sandboxUrl} disabled={pending} onChange={(event) => change("sandboxUrl", event.target.value)} /></label>
              <label className="grid gap-1.5"><T>E2B domain</T><input className={INPUT} value={host.domain} disabled={pending} onChange={(event) => change("domain", event.target.value)} /></label>
            </div>
          )}
          {host.keySet && !editingKey ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/40 p-3 pl-4 ring-1 ring-border/60">
              <KeyRound aria-hidden="true" className="size-4 text-muted-foreground" />
              <span>{opensandbox ? t("OpenSandbox API key") : t("E2B API key")}</span>
              <span className="font-mono text-muted-foreground">{host.keyHint ?? "••••••••"}</span>
              <Button type="button" variant="outline" size="sm" className="ml-auto rounded-lg" disabled={pending}
                onClick={() => setEditingKey(true)}><T>Change key</T></Button>
            </div>
          ) : (
            <label className="grid gap-1.5">
              {opensandbox ? <T>OpenSandbox API key (if the server has one)</T> : <T>E2B API key</T>}
              <input className={INPUT} type="password" autoComplete="new-password" value={key} disabled={pending}
                onChange={(event) => setKey(event.target.value)} placeholder={t("Paste your API key")} />
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {!opensandbox && <label className="grid gap-1.5"><T>Desktop template</T><input className={INPUT} value={host.template} required disabled={pending} onChange={(event) => change("template", event.target.value)} /></label>}
            <label className="grid gap-1.5"><T>Concurrent computers</T><input className={INPUT} type="number" min={1} max={32} value={host.maxMachines || ""} required disabled={pending} onChange={(event) => change("maxMachines", Number(event.target.value))} /></label>
            <label className="grid gap-1.5"><T>Idle time in seconds</T><input className={INPUT} type="number" min={1} max={86400} value={host.idleSeconds || ""} required disabled={pending} onChange={(event) => change("idleSeconds", Number(event.target.value))} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}><T>Save and test connection</T></Button>
            <p role="status" className="text-xs text-muted-foreground">{pending && opensandbox ? t("Making a test computer. This can take a minute.") : t(STATUS[host.status as keyof typeof STATUS] ?? STATUS.unchecked)}</p>
          </div>
          {capabilities?.pause && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>{t(PAUSE[capabilities.pause as keyof typeof PAUSE] ?? PAUSE.none)}</li>
              {capabilities.isolation && <li>{t(ISOLATION[capabilities.isolation as keyof typeof ISOLATION] ?? ISOLATION.container)}</li>}
            </ul>
          )}
        </form>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
