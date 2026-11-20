import "server-only";

// The BotTeam server (server/botteam): bots, chat and the social layer (/api/social/*). The browser never talks
// to it directly; pages, server actions and route handlers in this app do.
export const BOTTEAM_API = process.env.BOTTEAM_API || `http://127.0.0.1:${process.env.SERVER_PORT || 8899}`;

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${BOTTEAM_API}${path}`, {
      cache: "no-store",
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError("The BotTeam server isn't running. Start it with `pnpm dev:server`.", 503);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body && typeof body === "object" && "detail" in body ? (body as { detail: unknown }).detail : null;
    throw new ApiError(typeof detail === "string" ? detail : `The server answered ${response.status}.`, response.status);
  }
  return body as T;
}
