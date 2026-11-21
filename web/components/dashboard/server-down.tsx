"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ServerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T } from "@/lib/i18n/client";

const RETRY_MS = 4000;

// Shown instead of a page while the BotTeam server cannot be reached (it is starting, restarting or stopped). The
// page asks again by itself, so it comes back as soon as the server does.
export function ServerDown() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), RETRY_MS);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-3xl bg-card p-8 text-center shadow-lg ring-1 ring-border/60">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
          <ServerOff className="size-7" />
        </span>
        <h1 className="text-lg font-semibold tracking-tight"><T>The BotTeam server isn't running</T></h1>
        <p className="text-sm text-muted-foreground">
          <T>The dashboard reads everything from the BotTeam server. If it is restarting this page comes back by itself; otherwise start it with pnpm dev (or pnpm dev:server).</T>
        </p>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          <T>Trying again every few seconds…</T>
        </p>
        <Button variant="outline" className="rounded-xl" onClick={() => router.refresh()}>
          <T>Try again</T>
        </Button>
      </div>
    </div>
  );
}
