"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Globe, Hand, Maximize2, Monitor } from "lucide-react";
import type { AgentRole } from "@/lib/agent-roles";
import { T, useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ComputerScreen } from "@/components/browser/computer-screen";

type BrowserState = {
  botId?: string; resolution?: [number, number]; hostStatus?: string; engineSupported?: boolean;
  available?: boolean; enabled?: boolean; running: boolean; held: boolean; busy?: boolean; helpReason?: string | null;
  url?: string | null; title?: string | null;
  approvals?: { id: string; summary: string }[];
};
type Frame = { image: string; url: string; title: string; width: number; height: number };
type Input =
  | { type: "click"; x: number; y: number }
  | { type: "scroll"; dy: number }
  | { type: "key"; key: string }
  | { type: "text"; text: string }
  | { type: "goto"; url: string };
type Action =
  | { action: "wake" | "sleep" }
  | { action: "control"; holder: "person" | "bot" }
  | { action: "approval"; id: string; behavior: "allow" | "deny" }
  | { action: "input"; event: Input };

export function BrowserPanel({ campaignId, role, surface = "browser" }: { campaignId: number; role: AgentRole; surface?: "browser" | "computer" }) {
  const t = useT();
  const computer = surface === "computer";
  const query = `campaignId=${campaignId}&agentId=${role.id}&surface=${surface}`;
  const path = `/api/agents/browser?${query}`;
  const [state, setState] = useState<BrowserState>();
  const [frame, setFrame] = useState<Frame>();
  const [large, setLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [address, setAddress] = useState("");
  const inputQueue = useRef(Promise.resolve());
  const running = state?.running === true;
  const held = state?.held === true;
  const computerId = computer && running ? state?.botId : undefined;
  const [width, height] = state?.resolution ?? [1280, 800];

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const response = await fetch(path, { signal: abort.signal, cache: "no-store" });
        if (!response.ok) throw new Error();
        const status = await response.json() as BrowserState;
        if (!abort.signal.aborted) {
          setState(status);
          if (!status.running) setFrame(undefined);
        }
      } catch {
        if (!abort.signal.aborted) setFailed(true);
      }
    }
    void load();
    const timer = window.setInterval(load, running ? 3000 : 4000);
    return () => {
      abort.abort();
      window.clearInterval(timer);
    };
  }, [path, running]);

  useEffect(() => {
    if (!running || computer) return;
    const stream = new EventSource(`/api/agents/browser/watch?${query}`);
    stream.addEventListener("state", (event: MessageEvent<string>) => {
      const update = JSON.parse(event.data) as BrowserState;
      setState((previous) => ({ ...previous, ...update }));
      if (!update.running) setFrame(undefined);
    });
    stream.addEventListener("screen", (event: MessageEvent<string>) => setFrame(JSON.parse(event.data) as Frame));
    return () => stream.close();
  }, [query, running, computer]);

  async function send(payload: Action) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error();
    return response.json();
  }

  async function command(payload: Exclude<Action, { action: "input" }>) {
    setBusy(true);
    setFailed(false);
    try {
      await inputQueue.current;
      const next = await send(payload) as BrowserState;
      setState(next);
      if (!next.running) setFrame(undefined);
      // The person's clicks and keys only reach the machine through the large view: open it when they take over
      if (payload.action === "control" && payload.holder === "person" && next.held) setLarge(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function input(event: Input) {
    if (!held || busy) return;
    inputQueue.current = inputQueue.current.then(async () => {
      await send({ action: "input", event });
    }).catch(() => setFailed(true));
  }

  const url = frame?.url ?? state?.url;
  const publicLink = url && /^https?:\/\//i.test(url) ? url : null;
  const image = frame ? `data:image/jpeg;base64,${frame.image}` : running ? `/api/agents/browser/screen?${query}` : null;
  const control = running && (
    <Button variant="outline" size="sm" disabled={busy} onClick={() => command({ action: "control", holder: held ? "bot" : "person" })}>
      <Hand data-icon="inline-start" />
      {held ? t("Hand back") : t("Take over")}
    </Button>
  );

  return (
    <section className="min-w-0 space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
          {computer ? <Monitor className="size-4 shrink-0" aria-hidden /> : <Globe className="size-4 shrink-0" aria-hidden />}
          {t(role.name)}
        </h4>
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" size="sm" disabled={busy || !state || state.available === false} onClick={() => command({ action: running ? "sleep" : "wake" })}>
            {running ? t("Sleep") : t("Wake")}
          </Button>
          {control}
          <Button variant="ghost" size="sm" disabled={!running} onClick={() => setLarge(true)}>
            <Maximize2 data-icon="inline-start" /><T>Open large</T>
          </Button>
        </div>
      </div>
      {state?.helpReason && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 p-2 text-xs" role="status">
          <p className="flex-1">{t("Agent needs you: {reason}", { reason: state.helpReason })}</p>
          <Button size="sm" onClick={() => setLarge(true)}>{computer ? t("Open the computer") : t("Open the browser")}</Button>
        </div>
      )}
      {state?.approvals?.map(({ id, summary }) => (
        <div key={id} className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 p-2 text-xs">
          <p className="min-w-0 flex-1 break-words">{computer ? t("Approve computer action: {action}", { action: summary }) : t("Approve browser action: {action}", { action: summary })}</p>
          <Button size="sm" disabled={busy} onClick={() => command({ action: "approval", id, behavior: "allow" })}><T>Allow</T></Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => command({ action: "approval", id, behavior: "deny" })}><T>Deny</T></Button>
        </div>
      ))}
      <div className="grid aspect-[16/10] place-items-center overflow-hidden rounded-lg bg-muted" style={computer ? { aspectRatio: `${width}/${height}` } : undefined}>
        {computerId && !large ? (
          <ComputerScreen botId={computerId} />
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={computer ? t("Computer preview") : t("Browser preview")} className="size-full object-contain" />
        ) : (
          <div className="flex items-center gap-2 px-3 text-center text-xs text-muted-foreground">
            <Globe className="size-4 shrink-0" aria-hidden />
            {computer
              ? state?.enabled === false ? t("Computer use is disabled") : state?.engineSupported === false ? t("This engine cannot use computer tool images") : state?.available === false ? t("Computer host unavailable") : state ? t("Computer is asleep") : t("Loading computer…")
              : state?.enabled === false ? t("Browser is disabled") : state?.available === false ? t("Install Edge, Chrome, or Playwright Chromium.") : state ? t("Browser is asleep") : t("Loading browser…")}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        {running && (
          <div className="min-w-0">
            <p className="truncate">{frame?.title || state?.title || (computer ? t("Computer") : t("Browser"))}</p>
            {url && <p className="truncate" title={url}>{url}</p>}
            {state?.busy && <p><T>Browsing the web</T></p>}
          </div>
        )}
        {publicLink && (
          <a href={publicLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
            <ExternalLink className="size-3" aria-hidden /><T>Open in my browser</T>
          </a>
        )}
      </div>
      {failed && <p role="alert" className="text-xs text-destructive">{computer ? t("Could not complete the computer action.") : t("Could not complete the browser action.")}</p>}
      <Dialog open={large} onOpenChange={setLarge}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-[min(80rem,95vw)]" showCloseButton={false}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle>{computer ? t("{agent}'s computer", { agent: t(role.name) }) : t("{agent}'s browser", { agent: t(role.name) })}</DialogTitle>
            <div className="flex gap-2">
              {control}
              <DialogClose render={<Button variant="ghost" size="sm" />}><T>Close</T></DialogClose>
            </div>
          </div>
          {!computer && <form className="flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            input({ type: "goto", url: address.trim() });
          }}>
            <input type="url" required className="min-w-0 flex-1 rounded-md border bg-background px-2"
              value={address} onChange={(event) => setAddress(event.target.value)}
              placeholder={url ?? t("Browser address")} aria-label={t("Browser address")} disabled={!held || busy} />
            <Button size="sm" type="submit" disabled={!held || busy}><T>Go</T></Button>
          </form>}
          <p role="status" className="text-xs text-muted-foreground">
            {computer
              ? held ? t("You are controlling the computer") : t("The agent is controlling the computer")
              : held ? t("You are controlling the browser") : t("The agent is controlling the browser")}
          </p>
          {computerId ? (
            <div tabIndex={held ? 0 : undefined}
              style={{ aspectRatio: `${width}/${height}`, maxWidth: `min(100%, calc(68dvh * ${width / height}))` }}
              className="mx-auto w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-2 focus-visible:outline-primary"
              onClick={(event) => {
                if (!held) return;
                event.currentTarget.focus();
                const box = event.currentTarget.getBoundingClientRect();
                input({ type: "click", x: Math.min(width - 1, (event.clientX - box.left) * width / box.width), y: Math.min(height - 1, (event.clientY - box.top) * height / box.height) });
              }}
              onWheel={(event) => input({ type: "scroll", dy: Math.max(-5000, Math.min(5000, event.deltaY)) })}
              onPaste={(event) => {
                if (!held) return;
                event.preventDefault();
                input({ type: "text", text: event.clipboardData.getData("text/plain").slice(0, 2000) });
              }}
              onKeyDown={(event) => {
                if (!held || event.key === "Escape" || (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") return;
                const { key } = event;
                if (["Control", "Shift", "Meta", "Alt"].includes(key)) return;
                event.preventDefault();
                if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                  input({ type: "text", text: key });
                } else {
                  const modifiers = [event.ctrlKey && "ctrl", event.metaKey && "super", event.altKey && "alt", event.shiftKey && "shift"].filter(Boolean);
                  input({ type: "key", key: [...modifiers, key].join("+") });
                }
              }}>
              <ComputerScreen botId={computerId} />
            </div>
          ) : image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={t("Browser preview")} tabIndex={held ? 0 : undefined} draggable={false}
              className="mx-auto max-h-[68dvh] max-w-full rounded-lg bg-muted focus-visible:outline-2 focus-visible:outline-primary"
              onClick={(event) => {
                if (!held) return;
                const box = event.currentTarget.getBoundingClientRect();
                input({ type: "click", x: (event.clientX - box.left) * (frame?.width ?? 1280) / box.width, y: (event.clientY - box.top) * (frame?.height ?? 800) / box.height });
              }}
              onWheel={(event) => input({ type: "scroll", dy: Math.max(-5000, Math.min(5000, event.deltaY)) })}
              onPaste={(event) => {
                if (!held) return;
                event.preventDefault();
                input({ type: "text", text: event.clipboardData.getData("text/plain").slice(0, 2000) });
              }}
              onKeyDown={(event) => {
                if (!held || event.key === "Escape" || (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") return;
                const { key } = event;
                if (["Control", "Shift", "Meta", "Alt"].includes(key)) return;
                event.preventDefault();
                if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                  input({ type: "text", text: key });
                } else {
                  const modifiers = [event.ctrlKey && "Control", event.metaKey && "Meta", event.altKey && "Alt", event.shiftKey && "Shift"].filter(Boolean);
                  input({ type: "key", key: [...modifiers, key].join("+") });
                }
              }} />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
