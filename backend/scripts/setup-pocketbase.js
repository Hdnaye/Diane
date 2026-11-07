// Downloads the pinned PocketBase executable into bin/ and generates
// pb_data/types.d.ts (typings for pb_hooks/). Idempotent.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import {
  DATA_DIR,
  HOOKS_DIR,
  MIGRATIONS_DIR,
  POCKETBASE_BIN,
} from "./paths.js";
import {
  POCKETBASE_VERSION,
  assertSha256,
  resolveAsset,
} from "./pocketbase-release.js";
import { runSilently } from "./run-silently.js";

/** @returns {string | undefined} */
function installedVersion() {
  if (!existsSync(POCKETBASE_BIN)) return undefined;
  try {
    // Prints e.g. "pocketbase version 0.40.6".
    return execFileSync(POCKETBASE_BIN, ["--version"], { encoding: "utf8" })
      .trim()
      .split(" ")
      .pop();
  } catch {
    return undefined;
  }
}

async function download() {
  const asset = resolveAsset(process.platform, process.arch);
  console.log(`Downloading ${asset.url}`);
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  const archive = new Uint8Array(await response.arrayBuffer());
  assertSha256(archive, asset.sha256);

  const binary = unzipSync(archive, {
    filter: (file) => file.name === "pocketbase",
  }).pocketbase;
  if (!binary) throw new Error(`No 'pocketbase' executable in ${asset.name}`);

  mkdirSync(path.dirname(POCKETBASE_BIN), { recursive: true });
  writeFileSync(POCKETBASE_BIN, binary);
  chmodSync(POCKETBASE_BIN, 0o755);
}

if (installedVersion() === POCKETBASE_VERSION) {
  console.log(`PocketBase ${POCKETBASE_VERSION} already installed.`);
} else {
  await download();
  console.log(
    `PocketBase ${POCKETBASE_VERSION} installed in ${POCKETBASE_BIN}`,
  );
}

// Any PocketBase command (re)generates pb_data/types.d.ts. Its output is
// only shown if it fails.
runSilently(POCKETBASE_BIN, [
  "migrate",
  "up",
  `--dir=${DATA_DIR}`,
  `--hooksDir=${HOOKS_DIR}`,
  `--migrationsDir=${MIGRATIONS_DIR}`,
]);
console.log(`Hook typings written to ${path.join(DATA_DIR, "types.d.ts")}`);
