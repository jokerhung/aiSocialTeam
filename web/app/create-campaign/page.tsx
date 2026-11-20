import { getT } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/local-user";
import { listOffices, listUserCampaigns } from "@/lib/campaigns";
import { CreateCampaignWizard } from "@/components/campaign/create-campaign-wizard";

// Reads campaigns from the BotTeam server on every request
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Create your campaign") };
}

export default async function CreateCampaignPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const [offices, existing] = await Promise.all([listOffices(), listUserCampaigns(user.id)]);
  return <CreateCampaignWizard offices={offices} isFirst={existing.length === 0} />;
}
