// Runs PocketBase locally with this project's hooks and migrations.
// Extra arguments are forwarded, e.g. `npm run dev -- --http=0.0.0.0:8090`.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { POCKETBASE_BIN, pocketbaseArgs } from "./paths.js";
import { withoutBrowser } from "./no-browser.js";

if (!existsSync(POCKETBASE_BIN)) {
  console.error("PocketBase is not installed: run `npm run setup` first.");
  process.exit(1);
}

const pocketbase = spawn(
  POCKETBASE_BIN,
  // Without dev mode: it would print members' personal data (SQL values).
  [...pocketbaseArgs(["serve"]), ...process.argv.slice(2)],
  // Prints the installer URL instead of opening it when there is no superuser.
  { stdio: "inherit", env: withoutBrowser(process.env) },
);

for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
  process.on(signal, () => pocketbase.kill(signal));
}
pocketbase.on("exit", (code) => process.exit(code ?? 0));
