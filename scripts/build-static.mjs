// Production build of the web app (web/.next). It renders on the Node.js side and reads the Python server, so it is started with `pnpm start:web`; it is no longer a static export.
import { spawnSync } from "node:child_process";
const r = spawnSync("pnpm", ["--filter", "web", "exec", "next", "build"], { stdio: "inherit", shell: process.platform === "win32", env: process.env });
process.exit(r.status ?? 1);
