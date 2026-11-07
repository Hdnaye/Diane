import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKEND_DIR } from "../../scripts/paths.js";
import { POCKETBASE_VERSION } from "../../scripts/pocketbase-release.js";

describe("npm run setup", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "diane-setup-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("prints a readable error, without a stack trace, and fails", async () => {
    // An already installed PocketBase whose `migrate up` fails: no download.
    const fakePocketBase = path.join(tempDir, "pocketbase");
    await writeFile(
      fakePocketBase,
      [
        "#!/bin/sh",
        `[ "$1" = "--version" ] && echo "pocketbase version ${POCKETBASE_VERSION}" && exit 0`,
        "echo 'migration boom' >&2",
        "exit 4",
      ].join("\n"),
      { mode: 0o755 },
    );

    const result = spawnSync(
      process.execPath,
      ["scripts/setup-pocketbase.js"],
      {
        cwd: BACKEND_DIR,
        env: { ...process.env, POCKETBASE_BIN: fakePocketBase },
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.status).not.toBeNull();
    expect(result.stderr).toContain("migration boom");
    expect(result.stderr).toMatch(/migrate up.*failed \(exit code 4\)/);
    expect(result.stderr).not.toMatch(/^\s+at /m);
    expect(result.stderr).not.toContain("node:internal");
  });

  describe("organizer account", () => {
    let calls: string;
    let fakePocketBase: string;
    let envFile: string;

    beforeEach(async () => {
      // Installed PocketBase recording each call: arguments, then the
      // organizer variables it received.
      calls = path.join(tempDir, "calls");
      envFile = path.join(tempDir, ".env");
      fakePocketBase = path.join(tempDir, "pocketbase");
      await writeFile(
        fakePocketBase,
        [
          "#!/bin/sh",
          `[ "$1" = "--version" ] && echo "pocketbase version ${POCKETBASE_VERSION}" && exit 0`,
          `echo "$1 email=$DIANE_ORGANIZER_EMAIL key=$DIANE_ORGANIZER_KEY" >> '${calls}'`,
        ].join("\n"),
        { mode: 0o755 },
      );
    });

    function setup(env: NodeJS.ProcessEnv = {}) {
      return spawnSync(process.execPath, ["scripts/setup-pocketbase.js"], {
        cwd: BACKEND_DIR,
        env: {
          ...process.env,
          POCKETBASE_BIN: fakePocketBase,
          DIANE_ENV_FILE: envFile,
          DIANE_ORGANIZER_EMAIL: "",
          DIANE_ORGANIZER_KEY: "",
          ...env,
        },
        encoding: "utf8",
      });
    }

    it("creates or updates it from the .env file, after migrations", async () => {
      await writeFile(
        envFile,
        "DIANE_ORGANIZER_EMAIL=organizer@example.com\nDIANE_ORGANIZER_KEY=fake-key\n",
      );

      const result = setup();

      expect(result.status).toBe(0);
      expect((await readFile(calls, "utf8")).split("\n")).toEqual([
        "migrate email= key=",
        "organizer-upsert email=organizer@example.com key=fake-key",
        "",
      ]);
    });

    it("prefers variables already set in the environment", async () => {
      await writeFile(
        envFile,
        "DIANE_ORGANIZER_EMAIL=organizer@example.com\nDIANE_ORGANIZER_KEY=fake-key\n",
      );

      const result = setup({ DIANE_ORGANIZER_KEY: "other-fake-key" });

      expect(result.status).toBe(0);
      expect(await readFile(calls, "utf8")).toContain(
        "organizer-upsert email=organizer@example.com key=other-fake-key",
      );
    });

    it("is skipped, with a hint, without a .env file", async () => {
      const result = setup();

      expect(result.status).toBe(0);
      expect(await readFile(calls, "utf8")).not.toContain("organizer-upsert");
      expect(result.stdout).toMatch(/\.env\.example/);
    });

    it("never prints the key", async () => {
      await writeFile(
        envFile,
        "DIANE_ORGANIZER_EMAIL=organizer@example.com\nDIANE_ORGANIZER_KEY=fake-key-value\n",
      );

      const result = setup();

      expect(`${result.stdout}${result.stderr}`).not.toContain(
        "fake-key-value",
      );
    });
  });
});
