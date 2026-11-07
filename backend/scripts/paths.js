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
