// A fake transport left on in production would write every message (phone
// number, text) to disk and count it as sent: PocketBase warns at startup.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startPocketBase } from "./pocketbase-process.js";

/** Output of a PocketBase started with `env`, once it serves requests. */
async function startupOutput(env: NodeJS.ProcessEnv): Promise<string> {
  const outboxDir = await mkdtemp(path.join(tmpdir(), "diane-outbox-"));
  const pocketbase = await startPocketBase({
    env: {
      DIANE_SMS_TRANSPORT: "",
      DIANE_EMAIL_TRANSPORT: "",
      DIANE_FAKE_OUTBOX_DIR: outboxDir,
      ...env,
    },
  });
  try {
    return pocketbase.output();
  } finally {
    await pocketbase.stop();
    await rm(outboxDir, { recursive: true, force: true });
  }
}

describe("startup warnings", () => {
  it("warns when both fake transports are on, without printing data", async () => {
    const output = await startupOutput({
      DIANE_SMS_TRANSPORT: "fake",
      DIANE_EMAIL_TRANSPORT: "fake",
    });

    expect(output).toMatch(/WARNING.*DIANE_SMS_TRANSPORT=fake/);
    expect(output).toMatch(/WARNING.*DIANE_EMAIL_TRANSPORT=fake/);
    expect(output).not.toContain("diane-outbox-");
  });

  it("warns only for the fake transport that is on", async () => {
    const output = await startupOutput({ DIANE_EMAIL_TRANSPORT: " fake " });

    expect(output).not.toContain("DIANE_SMS_TRANSPORT=fake");
    expect(output).toMatch(/WARNING.*DIANE_EMAIL_TRANSPORT=fake/);
  });

  it("says nothing with the real transports", async () => {
    const output = await startupOutput({});

    expect(output).not.toMatch(/WARNING|fake/);
  });
});
