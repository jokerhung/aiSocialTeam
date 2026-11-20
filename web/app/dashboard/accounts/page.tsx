import Link from "next/link";
import { redirect } from "next/navigation";
import { Link2, Settings } from "lucide-react";
import { refreshedLabel } from "@/lib/blotato/shared";
import { getBlotatoIntegration } from "@/lib/blotato/store";
import { getCurrentUser } from "@/lib/local-user";
import { OverviewEmptyState, OverviewPanel } from "@/components/dashboard/overview/overview-panel";
import { AccountsList, RefreshAccountsButton } from "@/components/integrations/blotato";
import { Button } from "@/components/ui/button";

import { T } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";
export async function generateMetadata() {
  const { t, tn } = await getT();
  return { title: t("Accounts") };
}

// Every social account connected through Composio, grouped by platform
export default async function AccountsPage() {
  const { t, tn } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const integration = await getBlotatoIntegration(user.id);

  if (!integration.connected) {
    return (
      <OverviewPanel>
        <OverviewEmptyState
          Icon={Link2}
          tone="bg-linear-to-br from-sky-400 to-cyan-600 text-white"
          glow="shadow-sky-500/40"
          title={t("No accounts connected yet")}
          description={t("Connect your social accounts through Composio to see them here and post to them.")}
        >
          <Button size="lg" className="rounded-xl" nativeButton={false} render={<Link href="/dashboard/settings/integrations" />}>
            <Settings data-icon="inline-start" />
            <T>Go to Settings → Integrations</T>
          </Button>
        </OverviewEmptyState>
      </OverviewPanel>
    );
  }

  return (
    <OverviewPanel
      title={t("Connected accounts")}
      action={
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="sm" className="rounded-lg" nativeButton={false} render={<Link href="/dashboard/settings/integrations" />}>
            <T>Manage</T>
          </Button>
          <RefreshAccountsButton />
        </div>
      }
    >
      <p className="mb-5 text-sm text-muted-foreground">
        {tn(integration.accounts.length, "Through Composio · {n} account", "Through Composio · {n} accounts")} · {refreshedLabel(integration.refreshedAt, t)}
      </p>
      <AccountsList accounts={integration.accounts} />
    </OverviewPanel>
  );
}
