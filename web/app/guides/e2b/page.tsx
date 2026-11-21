import { SetupGuide } from "@/components/guides/setup-guide";
import { getT } from "@/lib/i18n/server";

export default async function E2BGuide() {
  const { t } = await getT();
  return <SetupGuide name="e2b-setup" title={t("E2B setup guide")} />;
}
