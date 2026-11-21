import { z } from "zod";

export const BrowserSettingsSchema = z.object({
  enabled: z.boolean(),
  surface: z.enum(["browser", "computer", "off"]).optional(),
  browser: z.enum(["auto", "msedge", "chrome"]),
  headed: z.boolean(),
  postVia: z.enum(["composio", "web"]),
  allowLocal: z.boolean(),
  allowDownloads: z.boolean(),
  idleSeconds: z.number().int().min(1).max(86400).nullable().optional(),
  resolution: z.tuple([z.number().int().min(640).max(1920), z.number().int().min(480).max(1200)]).optional(),
  runCommands: z.boolean().optional(),
});

export type BrowserSettings = z.infer<typeof BrowserSettingsSchema>;
export type AgentSurface = NonNullable<BrowserSettings["surface"]>;
export type BrowserSettingsView = {
  settings: BrowserSettings;
  availability: { installed?: string[]; versions?: Record<string, string | null>; mcpAvailable?: boolean };
  computer?: { status: string; engineSupported: boolean; hasMachine: boolean };
};
