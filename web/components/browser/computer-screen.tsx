"use client";

import { useEffect, useRef, useState } from "react";
import { T, useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

export function ComputerScreen({ botId }: { botId: string }) {
  const t = useT();
  const screen = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stopped = false;
    let connection: InstanceType<typeof import("@novnc/novnc").default> | undefined;
    setFailed(false);
    async function connect() {
      try {
        const { default: RFB } = await import("@novnc/novnc");
        if (!screen.current || stopped) return;
        const url = new URL(`/api/bots/${encodeURIComponent(botId)}/computer/stream`, location.href);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        connection = new RFB(screen.current, url.href);
        connection.viewOnly = true;
        connection.scaleViewport = true;
        connection.addEventListener("disconnect", (event: Event) => {
          if (!stopped && !(event as CustomEvent<{ clean: boolean }>).detail?.clean) setFailed(true);
        });
      } catch {
        if (!stopped) setFailed(true);
      }
    }
    void connect();
    return () => { stopped = true; connection?.disconnect(); };
  }, [botId, attempt]);

  return (
    <div className="relative size-full overflow-hidden bg-muted">
      {/* The stream is view-only. noVNC's canvas swallows mouse events, which kept clicks and the wheel from reaching the panel's
          handlers (they send the person's input through the server); without pointer events here they go to the panel. */}
      <div ref={screen} className="pointer-events-none size-full" role="img" aria-label={t("Computer preview")} />
      {failed && (
        <div role="alert" className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 bg-background/90 p-2 text-xs text-destructive">
          <T>Could not connect to the live computer preview.</T>
          <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((previous) => previous + 1)}><T>Retry</T></Button>
        </div>
      )}
    </div>
  );
}
