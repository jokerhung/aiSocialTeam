import { getT } from "@/lib/i18n/server";
import { Plug } from "lucide-react";
import { getSocialState } from "@/lib/composio";
import { OverviewPanel } from "@/components/dashboard/overview/overview-panel";
import { ComposioSocial } from "@/components/integrations/composio-social";

import { T } from "@/lib/i18n/client";
export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Integrations") };
}

// Settings → Integrations: connect social accounts through Composio (only the social apps are listed)
export default async function IntegrationsPage() {
  const state = await getSocialState({ cached: true });

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-slate-500/10 text-slate-600 dark:text-slate-300">
          <Plug className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight"><T>Integrations</T></h2>
          <p className="text-sm text-muted-foreground"><T>Social accounts connected through Composio. The key stays on the BotTeam server on this computer.</T></p>
        </div>
      </header>
      <OverviewPanel>
        <ComposioSocial state={state} />
      </OverviewPanel>
    </div>
  );
}
