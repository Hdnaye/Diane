import { describe, expect, it } from "vitest";
import {
  DATA_DIR,
  HOOKS_DIR,
  MIGRATIONS_DIR,
  PUBLIC_DIR,
  pocketbaseArgs,
} from "../../scripts/paths.js";

describe("pocketbaseArgs", () => {
  it("disables dev mode and points to this project's directories (the answer page in pb_public/)", () => {
    expect(pocketbaseArgs(["migrate", "up"])).toEqual([
      "migrate",
      "up",
      // Dev mode prints SQL queries with their values (personal data).
      "--dev=false",
      `--dir=${DATA_DIR}`,
      `--hooksDir=${HOOKS_DIR}`,
      `--migrationsDir=${MIGRATIONS_DIR}`,
      `--publicDir=${PUBLIC_DIR}`,
    ]);
  });

  it("accepts other data and hooks directories", () => {
    expect(
      pocketbaseArgs(["serve"], { dataDir: "/data", hooksDir: "/hooks" }),
    ).toEqual([
      "serve",
      "--dev=false",
      "--dir=/data",
      "--hooksDir=/hooks",
      `--migrationsDir=${MIGRATIONS_DIR}`,
      `--publicDir=${PUBLIC_DIR}`,
    ]);
  });
});
