import "server-only";

// Image generation and editing need ImageKit, which this app doesn't use: the post editor offers uploads only.
export function mediaCapabilities() {
  return { imageKit: false };
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
