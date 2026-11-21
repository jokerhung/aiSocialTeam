import { z } from "zod";

export const BrowserSettingsSchema = z.object({
  enabled: z.boolean(),
  browser: z.enum(["auto", "msedge", "chrome"]),
  headed: z.boolean(),
  postVia: z.enum(["composio", "web"]),
  allowLocal: z.boolean(),
  allowDownloads: z.boolean(),
});

export type BrowserSettings = z.infer<typeof BrowserSettingsSchema>;
export type BrowserSettingsView = {
  settings: BrowserSettings;
  availability: { installed?: string[]; versions?: Record<string, string | null>; mcpAvailable?: boolean };
};
