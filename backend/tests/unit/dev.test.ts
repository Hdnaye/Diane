import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKEND_DIR } from "../../scripts/paths.js";

describe("npm run dev", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "diane-dev-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Dev mode prints every SQL query with its values: members' names, phone
  // numbers and e-mails would end up in the terminal.
  it("runs PocketBase with dev mode disabled, extra flags last", async () => {
    const args = path.join(tempDir, "args");
    const fakePocketBase = path.join(tempDir, "pocketbase");
    await writeFile(fakePocketBase, `#!/bin/sh\necho "$*" > '${args}'\n`, {
      mode: 0o755,
    });

    const result = spawnSync(
      process.execPath,
      ["scripts/dev.js", "--http=127.0.0.1:0"],
      {
        cwd: BACKEND_DIR,
        env: { ...process.env, POCKETBASE_BIN: fakePocketBase },
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const received = (await readFile(args, "utf8")).trim().split(" ");
    expect(received[0]).toBe("serve");
    expect(received).toContain("--dev=false");
    expect(received).not.toContain("--dev");
    expect(received.at(-1)).toBe("--http=127.0.0.1:0");
  });
});
