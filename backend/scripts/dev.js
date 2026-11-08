// Runs PocketBase locally with this project's hooks and migrations.
// Extra arguments are forwarded, e.g. `npm run dev -- --http=0.0.0.0:8090`.
// Variables of backend/.env (public URL, SMS gateway...) are passed to
// PocketBase; variables already set in the environment win.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { ENV_FILE, POCKETBASE_BIN, pocketbaseArgs } from "./paths.js";
import { withoutBrowser } from "./no-browser.js";

if (!existsSync(POCKETBASE_BIN)) {
  console.error("PocketBase is not installed: run `npm run setup` first.");
  process.exit(1);
}

const fileEnv = existsSync(ENV_FILE)
  ? parseEnv(readFileSync(ENV_FILE, "utf8"))
  : {};

const pocketbase = spawn(
  POCKETBASE_BIN,
  // Without dev mode: it would print members' personal data (SQL values).
  [...pocketbaseArgs(["serve"]), ...process.argv.slice(2)],
  // Prints the installer URL instead of opening it when there is no superuser.
  { stdio: "inherit", env: withoutBrowser({ ...fileEnv, ...process.env }) },
);

for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
  process.on(signal, () => pocketbase.kill(signal));
}
pocketbase.on("exit", (code) => process.exit(code ?? 0));
