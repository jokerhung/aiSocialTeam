"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, UserRound } from "lucide-react";
import { refreshSocialApps } from "@/app/dashboard/settings/actions";
import { accountLabel, accountsByPlatform, type BlotatoAccount } from "@/lib/blotato/shared";
import { cn } from "@/lib/utils";
import { platformStyle, PlatformIcon } from "@/components/posts/platform-icon";
import { Button } from "@/components/ui/button";

import { T, useI18n, useT } from "@/lib/i18n/client";
// Fetches the connected accounts from Composio again, after one was connected or removed there
export function RefreshAccountsButton({ className }: { className?: string }) {
  const t = useT();
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
        {pending ? t("Refreshing…") : t("Refresh accounts")}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}

// The connected accounts, a card for every platform that has one (whatever social apps are connected through Composio)
export function AccountsList({ accounts }: { accounts: BlotatoAccount[] }) {
  const { tn } = useI18n();
  const byPlatform = accountsByPlatform(accounts);
  const platforms = Object.keys(byPlatform);

  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {platforms.map((platform) => {
        const list = byPlatform[platform] ?? [];
        const style = platformStyle(platform);
        return (
          <li key={platform} className="rounded-2xl bg-card p-3.5 ring-1 ring-border/60">
            <div className="flex items-center gap-2.5">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl shadow-md", style.tile)}>
                <PlatformIcon platform={platform} className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{style.name}</p>
                <p className="text-[11px] text-muted-foreground">{tn(list.length, "{n} account", "{n} accounts")}</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {list.map((account) => (
                <AccountRow key={account.id} account={account} />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
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
