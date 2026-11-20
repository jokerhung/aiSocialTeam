import Link from "next/link";
import { Plus, Rocket } from "lucide-react";
import { OverviewEmptyState, OverviewPanel } from "@/components/dashboard/overview/overview-panel";
import { Button } from "@/components/ui/button";

// Shown in place of a dashboard page while there is no campaign yet
export function NoCampaign() {
  return (
    <OverviewPanel>
      <OverviewEmptyState
        Icon={Rocket}
        tone="bg-linear-to-br from-blue-500 to-indigo-600 text-white"
        glow="shadow-blue-500/40"
        title="No campaign yet"
        description="Create a campaign to get your AI team (Master, Research, Creator, Scheduler and Analytics agents) and start planning posts."
      >
        <Button size="lg" className="rounded-xl" nativeButton={false} render={<Link href="/create-campaign" />}>
          <Plus data-icon="inline-start" />
          Create campaign
        </Button>
      </OverviewEmptyState>
    </OverviewPanel>
  );
}
