import { NextResponse, type NextRequest } from "next/server";

// The app has no sign-in, so who can open it is decided by the address they used: localhost, a literal LAN or
// Tailscale IP (the same ranges as server/botteam/auth.py), or a name listed in WEB_ALLOWED_HOSTS. Anything
// else (a public domain, a spoofed Host header) is refused.

const EXTRA_HOSTS = (process.env.WEB_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

function ipv4(host: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every((part) => part <= 255) ? parts : null;
}

function allowedAddress(host: string) {
  if (host === "localhost" || host === "::1") return true;
  const ip = ipv4(host);
  if (ip) {
    const [a, b] = ip;
    return (
      a === 127 || // loopback
      a === 10 || // LAN
      (a === 172 && b >= 16 && b <= 31) || // LAN
      (a === 192 && b === 168) || // LAN
      (a === 169 && b === 254) || // link-local
      (a === 100 && b >= 64 && b <= 127) // Tailscale (CGNAT)
    );
  }
  // IPv6 literals: unique-local (fc00::/7) and link-local (fe80::/10)
  return /^\[?(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(host);
}

export function proxy(request: NextRequest) {
  const authority = request.headers.get("host") ?? "";
  const host = authority.replace(/:\d+$/, "").toLowerCase().replace(/\.$/, "");
  if (allowedAddress(host) || EXTRA_HOSTS.includes(host)) return NextResponse.next();
  return new NextResponse("This address isn't allowed. Open the app on localhost or a LAN/Tailscale IP, or add the name to WEB_ALLOWED_HOSTS.", { status: 403 });
}
