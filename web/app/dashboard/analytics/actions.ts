"use server";

import { revalidatePath } from "next/cache";

export type SyncAnalyticsResult = { error?: string; synced?: number };

// There is no platform to pull from: the numbers are the ones saved on each post, so this just reloads them
export async function syncAnalyticsNow(): Promise<SyncAnalyticsResult> {
  revalidatePath("/dashboard/analytics");
  return { synced: 0 };
}
