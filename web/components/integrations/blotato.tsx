"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, UserRound } from "lucide-react";
import { refreshSocialApps } from "@/app/dashboard/settings/actions";
import { accountLabel, accountsByPlatform, type BlotatoAccount } from "@/lib/blotato/shared";
import { POST_PLATFORMS } from "@/lib/posts/shared";
import { platformName } from "@/lib/social-platforms";
import { cn } from "@/lib/utils";
import { PLATFORM_STYLES, PlatformIcon } from "@/components/posts/platform-icon";
import { Button } from "@/components/ui/button";

// Fetches the connected accounts from Composio again, after one was connected or removed there
export function RefreshAccountsButton({ className }: { className?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <Button
        variant="outline"
        size="sm"
        className="rounded-lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await refreshSocialApps();
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        <RefreshCw data-icon="inline-start" className={cn(pending && "animate-spin")} />
        {pending ? "Refreshing…" : "Refresh accounts"}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}

// The connected accounts: the platforms posts can go to first, then any others
export function AccountsList({ accounts }: { accounts: BlotatoAccount[] }) {
  const byPlatform = accountsByPlatform(accounts);
  const others = accounts.filter((account) => !(POST_PLATFORMS as readonly string[]).includes(account.platform));

  return (
    <div className="space-y-3">
      <ul className="grid gap-3 md:grid-cols-3">
        {POST_PLATFORMS.map((platform) => {
          const list = byPlatform[platform] ?? [];
          return (
            <li key={platform} className={cn("rounded-2xl p-3.5", list.length ? "bg-card ring-1 ring-border/60" : "border border-dashed border-border bg-muted/30")}>
              <div className="flex items-center gap-2.5">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl shadow-md", PLATFORM_STYLES[platform].tile)}>
                  <PlatformIcon platform={platform} className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{PLATFORM_STYLES[platform].name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {list.length ? `${list.length} account${list.length === 1 ? "" : "s"}` : "Not connected"}
                    {platform === "youtube" && " · videos & Shorts"}
                  </p>
                </div>
              </div>
              {list.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {list.map((account) => (
                    <AccountRow key={account.id} account={account} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <div className="rounded-2xl bg-muted/30 p-3.5 ring-1 ring-border/60">
          <p className="text-xs font-medium text-muted-foreground">Also connected (posting here supports Instagram, TikTok and YouTube for now)</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {others.map((account) => (
              <li key={account.id} className="rounded-lg bg-card px-2 py-1 text-xs ring-1 ring-border/60">
                <span className="font-medium">{platformName(account.platform === "twitter" ? "x" : account.platform)}</span> · {accountLabel(account)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AccountRow({ account }: { account: BlotatoAccount }) {
  return (
    <li className="flex items-center gap-2 rounded-xl bg-muted/50 px-2.5 py-1.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
        <UserRound className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{account.name}</span>
        {account.username && <span className="block truncate text-[11px] text-muted-foreground">{accountLabel(account)}</span>}
      </span>
    </li>
  );
}
