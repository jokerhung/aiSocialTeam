import "server-only";
import path from "node:path";

// Where uploaded post media is kept (served back by /api/media/file/<name>)
export const UPLOAD_DIR = path.join(process.env.BOTTEAM_DATA_DIR || path.join(process.env.USERPROFILE || process.env.HOME || ".", ".botteam"), "social-media");
