import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
