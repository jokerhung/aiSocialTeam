"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, KeyRound, Link2, Plus, RefreshCw, Trash2, Unplug, UserRound } from "lucide-react";
import { clearComposioKey, connectSocialApp, disconnectSocialAccount, readSocialApps, refreshSocialApps, saveComposioKey } from "@/app/dashboard/settings/actions";
import type { SocialApp, SocialState } from "@/lib/composio";
import { cn } from "@/lib/utils";
import { PLATFORM_STYLES, PlatformIcon } from "@/components/posts/platform-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { T, useI18n, useT } from "@/lib/i18n/client";
// Social accounts through Composio: the key is pasted once (the BotTeam server keeps it), then each app opens
// Composio's sign-in page and the connected accounts show up here.

const COMPOSIO_KEYS_URL = "https://platform.composio.dev/";
const WATCH_MS = 3000;
const WATCH_FOR_MS = 3 * 60 * 1000;

export function ComposioSocial({ state: initial }: { state: SocialState }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  useEffect(() => setState(initial), [initial]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-violet-500/30">
          <Link2 className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            Composio
            {state.configured && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" />
                <T>Connected</T>
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground"><T>Sign in to your social accounts through Composio. Posts go to the accounts you connect here.</T></p>
        </div>
      </div>

      {state.configured ? <Apps state={state} onState={setState} onChanged={() => router.refresh()} /> : <KeyForm onDone={() => router.refresh()} />}
    </div>
  );
}

function KeyForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveComposioKey(key);
      if (result.error) setError(result.error);
      else {
        setKey("");
        onDone();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-muted/40 p-4 ring-1 ring-border/60">
      <ol className="space-y-1.5 text-sm text-muted-foreground">
        <li>
          {t("1. Create a project and an API key in Composio.")}{" "}
          <a href={COMPOSIO_KEYS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
            <T>Open Composio</T> <ExternalLink className="size-3" />
          </a>
        </li>
        <li>{t("2. Paste the key below. The server checks it and keeps it; it is never shown again.")}</li>
      </ol>
      <Field>
        <FieldLabel htmlFor="composio-key" className="font-semibold">
          <T>Composio API key</T>
        </FieldLabel>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="composio-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t("Paste your API key")}
            className="h-11 rounded-xl bg-card pl-10 font-mono text-sm"
          />
        </div>
      </Field>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" className="h-10 rounded-xl px-4" disabled={pending || key.trim().length < 8}>
        {pending && <Spinner />}
        {pending ? t("Checking key…") : t("Connect Composio")}
      </Button>
    </form>
  );
}

function Apps({ state, onState, onChanged }: { state: SocialState; onState: (state: SocialState) => void; onChanged: () => void }) {
  const { t, tn } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefreshing] = useTransition();
  const [removing, startRemoving] = useTransition();
  const watching = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (watching.current && clearInterval(watching.current)), []);

  // After a sign-in tab opens, look at what the server saved until the account appears (or a few minutes pass)
  function watch(slug: string, before: number) {
    if (watching.current) clearInterval(watching.current);
    const until = Date.now() + WATCH_FOR_MS;
    watching.current = setInterval(async () => {
      const { state: next } = await readSocialApps();
      const app = next?.apps.find((a) => a.slug === slug);
      if (next) onState(next);
      if ((app && app.accounts.filter((a) => a.status === "ACTIVE").length > before) || Date.now() > until) {
        if (watching.current) clearInterval(watching.current);
        watching.current = null;
        onChanged();
      }
    }, WATCH_MS);
  }

  const connected = state.apps.filter((app) => app.connected);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/40 p-3 pl-4 text-sm ring-1 ring-border/60">
        <KeyRound className="size-4 text-muted-foreground" />
        <span className="font-mono text-muted-foreground">{state.keyHint ?? "••••••••"}</span>
        {state.source === "environment" && <span className="text-xs text-muted-foreground"><T>from COMPOSIO_API_KEY</T></span>}
        <span className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          disabled={refreshing}
          onClick={() =>
            startRefreshing(async () => {
              setError(null);
              const result = await refreshSocialApps();
              if (result.error) setError(result.error);
              else if (result.state) onState(result.state);
            })
          }
        >
          <RefreshCw data-icon="inline-start" className={cn(refreshing && "animate-spin")} />
          {refreshing ? t("Refreshing…") : t("Refresh")}
        </Button>
        {state.source === "saved" && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-destructive hover:text-destructive"
            disabled={removing}
            onClick={() =>
              startRemoving(async () => {
                const result = await clearComposioKey();
                if (result.error) setError(result.error);
                else onChanged();
              })
            }
          >
            {removing ? <Spinner /> : <Unplug data-icon="inline-start" />}
            <T>Remove key</T>
          </Button>
        )}
      </div>
      {(error || state.error) && <p className="text-xs text-destructive">{error ?? state.error}</p>}

      <p className="text-xs text-muted-foreground">
        {connected.length ? tn(connected.length, "{n} app connected", "{n} apps connected") : t("Nothing connected yet")} · {t("only social apps are listed here")}
      </p>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {state.apps.map((app) => (
          <AppCard key={app.slug} app={app} onStarted={(before) => watch(app.slug, before)} onChanged={onChanged} />
        ))}
      </ul>
    </div>
  );
}

function AppIcon({ app }: { app: SocialApp }) {
  if (app.slug in PLATFORM_STYLES) {
    const platform = app.slug as keyof typeof PLATFORM_STYLES;
    return (
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl shadow-md", PLATFORM_STYLES[platform].tile)}>
        <PlatformIcon platform={platform} className="size-4.5" />
      </span>
    );
  }
  return app.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={app.logo} alt="" className="size-9 shrink-0 rounded-xl bg-muted object-contain p-1.5" />
  ) : (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold">{app.label[0]}</span>
  );
}

function AppCard({ app, onStarted, onChanged }: { app: SocialApp; onStarted: (accountsBefore: number) => void; onChanged: () => void }) {
  const t = useT();
  const [alias, setAlias] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = app.accounts.filter((account) => account.status === "ACTIVE");

  function connect() {
    setError(null);
    startTransition(async () => {
      const result = await connectSocialApp(app.slug, alias);
      if (result.error || !result.url) {
        setError(result.error ?? t("No sign-in link came back."));
        return;
      }
      window.open(result.url, "_blank", "noopener");
      setAlias("");
      setAdding(false);
      onStarted(active.length);
    });
  }

  return (
    <li className={cn("rounded-2xl p-3.5", active.length ? "bg-card ring-1 ring-border/60" : "border border-dashed border-border bg-muted/30")}>
      <div className="flex items-center gap-2.5">
        <AppIcon app={app} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{app.label}</p>
          <p className="text-[11px] text-muted-foreground">
            {active.length ? `${active.length} account${active.length === 1 ? "" : "s"}` : app.pending ? t("Waiting for sign-in…") : t("Not connected")}
          </p>
        </div>
        {!active.length && (
          <Button size="sm" className="rounded-lg" disabled={pending} onClick={connect}>
            {pending ? <Spinner /> : <Link2 data-icon="inline-start" />}
            <T>Connect</T>
          </Button>
        )}
      </div>

      {active.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {active.map((account) => (
            <AccountRow key={account.id} slug={app.slug} id={account.id} name={account.alias || app.label} onChanged={onChanged} />
          ))}
        </ul>
      )}

      {active.length > 0 &&
        (adding ? (
          <div className="mt-3 flex gap-2">
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder={t("Name for the new account")} className="h-8 rounded-lg bg-card text-xs" />
            <Button size="sm" className="rounded-lg" disabled={pending || !alias.trim()} onClick={connect}>
              {pending ? <Spinner /> : t("Connect")}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="mt-2 rounded-lg" onClick={() => setAdding(true)}>
            <Plus data-icon="inline-start" />
            <T>Add another account</T>
          </Button>
        ))}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </li>
  );
}

function AccountRow({ slug, id, name, onChanged }: { slug: string; id: string; name: string; onChanged: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex items-center gap-2 rounded-xl bg-muted/50 px-2.5 py-1.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
        <UserRound className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{name}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-7 text-muted-foreground hover:text-destructive"
        aria-label={t("Disconnect {name}", { name })}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await disconnectSocialAccount(slug, id);
            onChanged();
          })
        }
      >
        {pending ? <Spinner /> : <Trash2 className="size-3.5" />}
      </Button>
    </li>
  );
}
