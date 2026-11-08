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

  // Hooks read their configuration (public URL, SMS gateway...) from the
  // environment: backend/.env must reach PocketBase.
  it("passes backend/.env to PocketBase, the environment winning", async () => {
    const out = path.join(tempDir, "env");
    const fakePocketBase = path.join(tempDir, "pocketbase");
    await writeFile(
      fakePocketBase,
      `#!/bin/sh\necho "$DIANE_PUBLIC_URL|$DIANE_SMS_GATEWAY_URL" > '${out}'\n`,
      { mode: 0o755 },
    );
    const envFile = path.join(tempDir, ".env");
    await writeFile(
      envFile,
      "DIANE_PUBLIC_URL=https://diane.example.org\nDIANE_SMS_GATEWAY_URL=http://192.168.1.50:8080\n",
    );

    const result = spawnSync(process.execPath, ["scripts/dev.js"], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        POCKETBASE_BIN: fakePocketBase,
        DIANE_ENV_FILE: envFile,
        DIANE_SMS_GATEWAY_URL: "http://192.168.1.60:8080",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect((await readFile(out, "utf8")).trim()).toBe(
      "https://diane.example.org|http://192.168.1.60:8080",
    );
  });
});
