import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// The dev server may be opened as localhost, 127.0.0.1, any IP of this computer (LAN, Tailscale) or a name in
// WEB_ALLOWED_HOSTS (comma-separated, e.g. my-machine.my-tailnet.ts.net)
const devOrigins = new Set(["localhost", "127.0.0.1"]);
for (const list of Object.values(networkInterfaces())) {
  for (const entry of list ?? []) if (!entry.internal) devOrigins.add(entry.address);
}
for (const host of (process.env.WEB_ALLOWED_HOSTS ?? "").split(",")) if (host.trim()) devOrigins.add(host.trim());

const nextConfig: NextConfig = {
  // A second build next to the running one (tests use NEXT_DIST_DIR=.next-test)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  allowedDevOrigins: [...devOrigins],
  async rewrites() {
    const server = process.env.BOTTEAM_API || `http://127.0.0.1:${process.env.SERVER_PORT || 8899}`;
    return [{
      source: "/api/bots/:botId/computer/stream",
      destination: `${server}/api/bots/:botId/computer/stream`,
    }];
  },
  // Office scene bundles are read from disk at runtime (lib/office-studio.ts)
  outputFileTracingIncludes: {
    "/dashboard": ["./office-studio/**/*.json"],
    "/api/office-studio/[office]/[...asset]": ["./office-studio/**/*.json"],
    "/guides/e2b": ["../docs/e2b-setup.*.md"],
  },
  experimental: {
    // Allow custom campaign icon uploads (validated to 2MB in the action)
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
