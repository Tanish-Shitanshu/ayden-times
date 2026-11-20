// Builds the web app if it has been merged into apps/web; otherwise skips (API-only build).
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync(new URL("../apps/web/package.json", import.meta.url))) {
  console.log("apps/web not present: skipping web build (API-only)");
  process.exit(0);
}
const r = spawnSync("npm", ["-w", "@ayden/web", "run", "build"], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
