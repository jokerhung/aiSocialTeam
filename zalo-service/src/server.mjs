// BotTeam's Zalo service: node zalo-service/src/server.mjs
//   ZALO_PORT        default 8902 (listens on 127.0.0.1 only)
//   BOTTEAM_API      where the BotTeam server is (default http://127.0.0.1:8899); used to check that a browser is allowed in
//   BOTTEAM_DATA_DIR where BotTeam keeps its data (default ~/.botsocial); the sessions live in <it>/zalo-service
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { makeServer } from "./http.mjs";
import { ZaloService } from "./service.mjs";

const port = Number(process.env.ZALO_PORT || 8902);
const api = (process.env.BOTTEAM_API || "http://127.0.0.1:8899").replace(/\/+$/, "");
// The data folder from .env (BOTTEAM_DATA_DIR): "~", %VAR% and $VAR are expanded; default ~/.botsocial
function dataDir() {
  const raw = (process.env.BOTTEAM_DATA_DIR ?? "").trim();
  if (!raw) return join(homedir(), ".botsocial");
  return raw.replace(/^~(?=$|[\\/])/, homedir()).replace(/%(\w+)%|\$(\w+)/g, (match, a, b) => process.env[a ?? b] ?? match);
}
const dir = join(dataDir(), "zalo-service");
mkdirSync(dir, { recursive: true });

// The secret the BotTeam server reads from the same file, so nothing has to be configured.
const secretFile = join(dir, "secret");
if (!existsSync(secretFile)) {
  writeFileSync(secretFile, randomBytes(32).toString("hex"), { mode: 0o600 });
  try { chmodSync(secretFile, 0o600); } catch { /* not on every system */ }
}
const secret = process.env.ZALO_SERVICE_SECRET || readFileSync(secretFile, "utf8").trim();

const { Zalo } = await import("zca-js");
const service = new ZaloService({
  dir,
  makeZalo: () => new Zalo({ selfListen: false, checkUpdate: false, logging: false }),
  log: (m) => console.log(`[zalo] ${m}`),
});
await service.start();

const server = makeServer({ service, secret, api });
server.listen(port, "127.0.0.1", () => console.log(`Zalo service on http://127.0.0.1:${port} (${service.accounts.size} account(s))`));
server.on("error", (e) => { console.error(`Zalo service could not start: ${e.message}`); process.exit(1); });
const bye = async () => { await service.stop(); server.close(); process.exit(0); };
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
