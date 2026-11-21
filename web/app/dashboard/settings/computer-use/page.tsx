import { ComputerHostSettings } from "@/components/browser/computer-host-settings";
import { OverviewPanel } from "@/components/dashboard/overview/overview-panel";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Computer Use") };
}

export default function ComputerUsePage() {
  return (
    <OverviewPanel>
      <ComputerHostSettings />
    </OverviewPanel>
  );
}
