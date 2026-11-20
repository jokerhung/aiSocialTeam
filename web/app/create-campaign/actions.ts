"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/botteam";
import { getCampaignIcon } from "@/lib/campaign-icons";
import { ACTIVE_CAMPAIGN_COOKIE, listOffices, type Campaign } from "@/lib/campaigns";

export type CreateCampaignState = { error?: string };

const MAX_ICON_BYTES = 2 * 1024 * 1024;
const ICON_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];

export async function createCampaign(_prev: CreateCampaignState, formData: FormData): Promise<CreateCampaignState> {
  const name = String(formData.get("name") ?? "").trim();
  const iconId = String(formData.get("icon") ?? "");
  const iconFile = formData.get("iconFile");
  const officeId = String(formData.get("office") ?? "");

  if (!name) return { error: "Give your campaign a name." };
  if (name.length > 60) return { error: "Campaign name must be 60 characters or fewer." };

  const office = (await listOffices()).find((o) => o.id === officeId);
  if (!office) return { error: "Choose an office for your AI agents." };

  let icon: string | null = null;
  let iconUrl: string | null = null;

  if (iconFile instanceof File && iconFile.size > 0) {
    if (!ICON_TYPES.includes(iconFile.type)) return { error: "Icon must be a PNG, JPG, WEBP, GIF or SVG image." };
    if (iconFile.size > MAX_ICON_BYTES) return { error: "Icon must be 2MB or smaller." };
    // Kept with the campaign as a data URL: icons are small
    iconUrl = `data:${iconFile.type};base64,${Buffer.from(await iconFile.arrayBuffer()).toString("base64")}`;
  } else if (getCampaignIcon(iconId)) {
    icon = iconId;
  } else {
    return { error: "Pick an icon or upload your own." };
  }

  let created: Campaign;
  try {
    created = await api<Campaign>("/api/social/campaigns", { method: "POST", json: { name, icon, iconUrl, officeImage: office.src } });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Couldn't create the campaign. Please try again." };
  }

  // Jump straight into the new campaign
  (await cookies()).set(ACTIVE_CAMPAIGN_COOKIE, String(created.id), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}
