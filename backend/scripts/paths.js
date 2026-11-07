import { fileURLToPath } from "node:url";
import path from "node:path";

/** Absolute path of the backend/ directory. */
export const BACKEND_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Downloaded PocketBase executable (git-ignored). */
export const POCKETBASE_BIN =
  process.env.POCKETBASE_BIN ?? path.join(BACKEND_DIR, "bin", "pocketbase");

/** Local development data directory (git-ignored). */
export const DATA_DIR = path.join(BACKEND_DIR, "pb_data");
export const HOOKS_DIR = path.join(BACKEND_DIR, "pb_hooks");
export const MIGRATIONS_DIR = path.join(BACKEND_DIR, "pb_migrations");

/** Local secrets (not committed, see .env.example). */
export const ENV_FILE =
  process.env.DIANE_ENV_FILE ?? path.join(BACKEND_DIR, ".env");

/**
 * Arguments of a PocketBase command run on this project.
 *
 * Dev mode is always disabled: it prints every SQL query with its values
 * (members' personal data, password hashes, token keys), and PocketBase
 * 0.40.6 turns it on by default when its binary lives under the OS
 * temporary or cache directory (it then believes it runs from `go run`).
 *
 * @param {string[]} command e.g. ["migrate", "up"].
 * @param {{ dataDir?: string, hooksDir?: string }} [dirs]
 * @returns {string[]}
 */
export function pocketbaseArgs(
  command,
  { dataDir = DATA_DIR, hooksDir = HOOKS_DIR } = {},
) {
  return [
    ...command,
    "--dev=false",
    `--dir=${dataDir}`,
    `--hooksDir=${hooksDir}`,
    `--migrationsDir=${MIGRATIONS_DIR}`,
  ];
}
