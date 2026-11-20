import { getT } from "@/lib/i18n/server";
import { NoCampaign } from "@/components/dashboard/no-campaign";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/local-user";
import { getActiveCampaign } from "@/lib/campaigns";
import { getRecentActivity } from "@/lib/overview";
import { getOfficeScene, officeIdFromImage } from "@/lib/office-studio";
import { AgentWorkspace } from "@/components/agents/agent-workspace";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("AI Agent") };
}

// Shell (sidebar, header, auth + campaign guards) lives in ../layout.tsx
export default async function AiAgentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const campaign = await getActiveCampaign(user.id);
  if (!campaign) return <NoCampaign />;

  const [office, activity] = await Promise.all([
    getOfficeScene(officeIdFromImage(campaign.officeImage)),
    getRecentActivity(campaign.id, 50),
  ]);

  const name = user.profile?.name ?? user.email;
  const initials = name
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return <AgentWorkspace office={office} officeImage={campaign.officeImage} activity={activity} userInitials={initials} />;
}
