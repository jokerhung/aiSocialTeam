import "server-only";
import path from "node:path";

// Where uploaded post media is kept (served back by /api/media/file/<name>)
const HOME = process.env.USERPROFILE || process.env.HOME || ".";

// The data folder from .env (BOTTEAM_DATA_DIR): "~", %VAR% and $VAR are expanded; default ~/.botsocial
function dataDir() {
  const raw = (process.env.BOTTEAM_DATA_DIR ?? "").trim();
  if (!raw) return path.join(HOME, ".botsocial");
  return raw
    .replace(/^~(?=$|[\\/])/, HOME)
    .replace(/%(\w+)%|\$(\w+)/g, (match, a: string | undefined, b: string | undefined) => process.env[(a ?? b) as string] ?? match);
}

export const UPLOAD_DIR = path.join(/*turbopackIgnore: true*/ dataDir(), "social-media");
