import { SetupGuide } from "@/components/guides/setup-guide";
import { getT } from "@/lib/i18n/server";

export default async function OpenSandboxGuide() {
  const { t } = await getT();
  return <SetupGuide name="opensandbox-setup" title={t("OpenSandbox setup guide")} />;
}
