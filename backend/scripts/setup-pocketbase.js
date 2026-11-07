// Downloads the pinned PocketBase executable into bin/, applies migrations
// (which generates pb_data/types.d.ts, typings for pb_hooks/) and creates or
// updates the organizer account from backend/.env. Idempotent.
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { unzipSync } from "fflate";
import { DATA_DIR, ENV_FILE, POCKETBASE_BIN, pocketbaseArgs } from "./paths.js";
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

const ORGANIZER_VARIABLES = /** @type {const} */ ([
  "DIANE_ORGANIZER_EMAIL",
  "DIANE_ORGANIZER_KEY",
]);

/**
 * Organizer variables, from the environment or else from backend/.env;
 * undefined when none is set.
 *
 * @returns {Record<string, string> | undefined}
 */
function organizerEnv() {
  const file = existsSync(ENV_FILE)
    ? parseEnv(readFileSync(ENV_FILE, "utf8"))
    : {};
  /** @type {Record<string, string>} */
  const values = {};
  for (const name of ORGANIZER_VARIABLES) {
    const value = process.env[name] || file[name];
    if (value) values[name] = value;
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

async function main() {
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
  runSilently(POCKETBASE_BIN, pocketbaseArgs(["migrate", "up"]));
  console.log(`Hook typings written to ${path.join(DATA_DIR, "types.d.ts")}`);

  const organizer = organizerEnv();
  if (!organizer) {
    console.log(
      `No organizer account configured: copy .env.example to ${ENV_FILE}, set its values and run setup again.`,
    );
    return;
  }
  // Prints neither the email nor the key (the command does not either).
  runSilently(POCKETBASE_BIN, pocketbaseArgs(["organizer-upsert"]), {
    env: { ...process.env, ...organizer },
  });
  console.log("Organizer account created or updated.");
}

// Failures are expected (network, checksum, PocketBase errors): print the
// message only, no Node stack trace.
try {
  await main();
} catch (error) {
  let message = error instanceof Error ? error.message : String(error);
  // e.g. fetch() only says "fetch failed": the reason is in `cause`.
  if (error instanceof Error && error.cause instanceof Error) {
    message += ` (${error.cause.message})`;
  }
  console.error(`Setup failed: ${message}`);
  process.exitCode = 1;
}
