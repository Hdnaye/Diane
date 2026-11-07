// `pocketbase organizer-upsert` creates or updates the single organizer
// account from DIANE_ORGANIZER_EMAIL and DIANE_ORGANIZER_KEY (run by
// `npm run setup` with backend/.env).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HOOKS_DIR,
  MIGRATIONS_DIR,
  POCKETBASE_BIN,
} from "../../scripts/paths.js";
import { startPocketBase } from "./pocketbase-process.js";

describe("pocketbase organizer-upsert", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "diane-organizer-"));
    pocketbase(["migrate", "up"], {});
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  function pocketbase(args: string[], env: Record<string, string>) {
    return spawnSync(
      POCKETBASE_BIN,
      [
        ...args,
        `--dir=${dataDir}`,
        `--hooksDir=${HOOKS_DIR}`,
        `--migrationsDir=${MIGRATIONS_DIR}`,
      ],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          ...env,
        },
      },
    );
  }

  function upsert(email: string, key: string) {
    return pocketbase(["organizer-upsert"], {
      DIANE_ORGANIZER_EMAIL: email,
      DIANE_ORGANIZER_KEY: key,
    });
  }

  /** Starts PocketBase on dataDir and tries each credential. */
  async function authenticate(
    credentials: { email: string; key: string }[],
  ): Promise<({ id: string } | null)[]> {
    const server = await startPocketBase({ dataDir });
    try {
      return await Promise.all(
        credentials.map(async ({ email, key }) => {
          const response = await fetch(
            `${server.url}/api/collections/organizers/auth-with-password`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ identity: email, password: key }),
            },
          );
          if (response.status !== 200) return null;
          const body = (await response.json()) as { record: { id: string } };
          return { id: body.record.id };
        }),
      );
    } finally {
      await server.stop();
    }
  }

  const email = "organizer@example.com";
  const key = () => randomBytes(32).toString("hex");

  it("creates the organizer account", async () => {
    const secret = key();

    const result = upsert(email, secret);

    expect(result.status).toBe(0);
    const [auth] = await authenticate([{ email, key: secret }]);
    expect(auth).not.toBeNull();
  });

  it("updates the key of the existing account", async () => {
    const oldKey = key();
    const newKey = key();
    upsert(email, oldKey);

    const result = upsert(email, newKey);

    expect(result.status).toBe(0);
    const [withOld, withNew] = await authenticate([
      { email, key: oldKey },
      { email, key: newKey },
    ]);
    expect(withOld).toBeNull();
    expect(withNew).not.toBeNull();
  });

  it("keeps a single account when the email changes", async () => {
    const oldKey = key();
    const newKey = key();
    const newEmail = "new-organizer@example.com";
    upsert(email, oldKey);
    const [before] = await authenticate([{ email, key: oldKey }]);

    const result = upsert(newEmail, newKey);

    expect(result.status).toBe(0);
    const [withOld, withNew] = await authenticate([
      { email, key: oldKey },
      { email: newEmail, key: newKey },
    ]);
    expect(withOld).toBeNull();
    expect(withNew?.id).toBe(before?.id);
  });

  it.each([
    ["no email", "", key()],
    ["no key", email, ""],
    ["an invalid email", "not-an-email", key()],
    ["a key shorter than 32 characters", email, "k".repeat(31)],
  ])("fails with %s", (_label, badEmail, badKey) => {
    const result = upsert(badEmail, badKey);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/DIANE_ORGANIZER_/);
  });

  it("never prints the email or the key", () => {
    const secret = key();

    const result = upsert(email, secret);
    const output = `${result.stdout}${result.stderr}`;

    expect(output).not.toContain(email);
    expect(output).not.toContain(secret);
  });
});
