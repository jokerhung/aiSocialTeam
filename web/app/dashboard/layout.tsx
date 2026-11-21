import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/local-user";
import { loadCampaigns, pickActiveCampaign } from "@/lib/campaigns";
import { SIDEBAR_COOKIE } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ServerDown } from "@/components/dashboard/server-down";
import { ApiError } from "@/lib/botteam";

// Every dashboard page reads from the BotTeam server on each request
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  let campaigns, active;
  try {
    campaigns = await loadCampaigns();
    active = await pickActiveCampaign(campaigns);
  } catch (error) {
    // The BotTeam server is not reachable (starting, restarting or stopped): say so, and ask again by itself
    if (error instanceof ApiError) return <ServerDown />;
    throw error;
  }

  // Sidebar starts as an icon rail unless the user expanded it before
  const defaultExpanded = (await cookies()).get(SIDEBAR_COOKIE)?.value === "true";

  const name = user.profile?.name ?? user.email;
  const initials = name
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <DashboardShell
      campaigns={campaigns.map(({ id, name, icon, iconUrl, endedAt }) => ({ id, name, icon, iconUrl, ended: !!endedAt }))}
      activeCampaignId={active?.id ?? 0}
      user={{ name, email: user.email, initials, avatarUrl: user.profile?.avatar_url }}
      defaultExpanded={defaultExpanded}
    >
      {children}
    </DashboardShell>
  );
}
