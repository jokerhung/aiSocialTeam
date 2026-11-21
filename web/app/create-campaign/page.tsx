import { getT } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/local-user";
import { listOffices, loadCampaigns } from "@/lib/campaigns";
import { CreateCampaignWizard } from "@/components/campaign/create-campaign-wizard";
import { ServerDown } from "@/components/dashboard/server-down";
import { ApiError } from "@/lib/botteam";

// Reads campaigns from the BotTeam server on every request
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Create your campaign") };
}

export default async function CreateCampaignPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  try {
    const [offices, existing] = await Promise.all([listOffices(), loadCampaigns()]);
    return <CreateCampaignWizard offices={offices} isFirst={existing.length === 0} />;
  } catch (error) {
    if (error instanceof ApiError) return <ServerDown />;
    throw error;
  }
}
