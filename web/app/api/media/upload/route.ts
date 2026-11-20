import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { jsonError } from "@/lib/posts/media";
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, VIDEO_TYPES, type PostMedia } from "@/lib/posts/shared";
import { UPLOAD_DIR } from "@/lib/uploads";

export const runtime = "nodejs";

// Uploads an image or video for a post (multipart "file")
export async function POST(request: Request) {
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size === 0) return jsonError("Choose an image or video to upload.", 400);
  const video = VIDEO_TYPES.includes(file.type);
  if (!video && !IMAGE_TYPES.includes(file.type)) return jsonError("Upload a PNG, JPG, WEBP or GIF image, or an MP4, MOV or WEBM video.", 400);
  if (!video && file.size > MAX_UPLOAD_BYTES) return jsonError("Images must be 10MB or smaller.", 400);
  if (video && file.size > MAX_VIDEO_BYTES) return jsonError("Videos must be 100MB or smaller.", 400);

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const stored = `${randomUUID()}.${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));

  const origin = new URL(request.url).origin;
  const media: PostMedia = { url: `${origin}/api/media/file/${stored}`, fileId: stored, name: file.name.replace(/\.[^.]+$/, "") || "upload", mimeType: file.type, origin: "upload" };
  return Response.json({ media });
}
