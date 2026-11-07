// Generates the app's TypeScript record types from the migrations
// (`npm run typegen`): applies pb_migrations/ to an empty temporary database,
// runs pocketbase-typegen on it and formats the result with the app's
// Prettier settings. Never reads the local pb_data/ (personal data).
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import {
  BACKEND_DIR,
  HOOKS_DIR,
  MIGRATIONS_DIR,
  POCKETBASE_BIN,
} from "./paths.js";
import { runSilently } from "./run-silently.js";

const APP_DIR = path.join(BACKEND_DIR, "..", "app");

/** Generated file, committed in the app. */
export const APP_TYPES_FILE = path.join(
  APP_DIR,
  "src",
  "lib",
  "pocketbase-types.ts",
);

const TYPEGEN_BIN = path.join(
  BACKEND_DIR,
  "node_modules",
  ".bin",
  "pocketbase-typegen",
);

const HEADER = `// Generated file, ne pas modifier à la main (do not edit by hand):
// run \`npm run typegen\` in backend/ after changing pb_migrations/.
/* eslint-disable @typescript-eslint/no-redeclare -- each select field is a const and a type of the same name */
`;

/**
 * The app's Prettier options. Its plugins (Tailwind class sorting) are not
 * installed in backend/ and do not apply to type declarations.
 *
 * @returns {Promise<prettier.Options>}
 */
async function appPrettierOptions() {
  const config = JSON.parse(
    await readFile(path.join(APP_DIR, ".prettierrc"), "utf8"),
  );
  delete config.plugins;
  delete config.tailwindFunctions;
  return config;
}

/**
 * Writes the record types of the collections created by the migrations.
 *
 * @param {string} outFile
 */
export async function generateTypes(outFile) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "diane-typegen-"));
  try {
    const dataDir = path.join(tempDir, "pb_data");
    const rawFile = path.join(tempDir, "pocketbase-types.ts");
    runSilently(POCKETBASE_BIN, [
      "migrate",
      "up",
      `--dir=${dataDir}`,
      `--hooksDir=${HOOKS_DIR}`,
      `--migrationsDir=${MIGRATIONS_DIR}`,
    ]);
    // --no-sdk: the app does not depend on the PocketBase JS SDK (yet).
    runSilently(TYPEGEN_BIN, [
      "--db",
      path.join(dataDir, "data.db"),
      "--out",
      rawFile,
      "--no-sdk",
    ]);
    // Comments nested inside type expressions are placed differently by
    // Prettier with and without the app's Tailwind plugin (which wraps the
    // TypeScript parser): drop them so that `format:check` agrees in app/.
    const raw = (await readFile(rawFile, "utf8")).replace(
      /^\t{2,}\/\/.*\n/gm,
      "",
    );
    const types = await prettier.format(HEADER + raw, {
      ...(await appPrettierOptions()),
      parser: "typescript",
    });
    await writeFile(outFile, types);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await generateTypes(APP_TYPES_FILE);
    console.log(`Types written to ${APP_TYPES_FILE}`);
  } catch (error) {
    console.error(
      `Type generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
