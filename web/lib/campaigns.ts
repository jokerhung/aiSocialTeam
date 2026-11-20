import "server-only";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { cookies } from "next/headers";
import { api } from "@/lib/botteam";

// Cookie holding the id of the campaign the user is currently working in.
export const ACTIVE_CAMPAIGN_COOKIE = "active_campaign";

export type Campaign = {
  id: number;
  name: string;
  icon: string | null;
  iconUrl: string | null;
  officeImage: string;
  endedAt: string | null;
  createdAt: string;
  // Role id (master, research, creator, scheduler, analytics) → the BotTeam bot that plays it
  bots: Record<string, string>;
};

export type Office = { id: string; name: string; src: string };

const OFFICES_DIR = path.join(process.cwd(), "public", "offices");
const IMAGE_EXT = /\.(png|jpe?g|webp|avif)$/i;

// All campaigns, newest first. Cached per request so layout + page share one call. (There is one person
// per computer, so the user id the pages pass along is not used.)
export const listUserCampaigns = cache(async (_userId?: string): Promise<Campaign[]> => (await api<{ campaigns: Campaign[] }>("/api/social/campaigns")).campaigns);

export async function getUserCampaign(userId?: string) {
  return (await listUserCampaigns(userId))[0] ?? null;
}

// The campaign selected in the switcher, falling back to the newest one.
export async function getActiveCampaign(userId?: string) {
  const all = await listUserCampaigns(userId);
  const activeId = Number((await cookies()).get(ACTIVE_CAMPAIGN_COOKIE)?.value);
  return all.find((c) => c.id === activeId) ?? all[0] ?? null;
}

// AI agent office options, read from /public/offices so new images show up automatically.
export async function listOffices(): Promise<Office[]> {
  const files = await readdir(OFFICES_DIR).catch(() => [] as string[]);
  return files
    .filter((file) => IMAGE_EXT.test(file))
    .sort()
    .map((file) => {
      const id = file.replace(IMAGE_EXT, "");
      const name = id
        .split(/[-_]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      return { id, name, src: `/offices/${file}` };
    });
}
