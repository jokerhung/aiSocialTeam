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

// All campaigns, newest first, or an error when the server cannot be reached. Cached per request so the layout and the
// page share one call. The layout uses this one to tell the person the server is down.
export const loadCampaigns = cache(async (): Promise<Campaign[]> => (await api<{ campaigns: Campaign[] }>("/api/social/campaigns")).campaigns);

// The same for pages and routes: with the server down there are no campaigns to show (the layout reports the outage), so a
// page does not fail on its own and fill the log with the same error again. (There is one person per computer, so the
// user id the pages pass along is not used.)
export async function listUserCampaigns(_userId?: string): Promise<Campaign[]> {
  return loadCampaigns().catch(() => []);
}

export async function getUserCampaign(userId?: string) {
  return (await listUserCampaigns(userId))[0] ?? null;
}

// The campaign selected in the switcher, falling back to the newest one.
export async function pickActiveCampaign(all: Campaign[]) {
  const activeId = Number((await cookies()).get(ACTIVE_CAMPAIGN_COOKIE)?.value);
  return all.find((c) => c.id === activeId) ?? all[0] ?? null;
}

export async function getActiveCampaign(userId?: string) {
  return pickActiveCampaign(await listUserCampaigns(userId));
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
