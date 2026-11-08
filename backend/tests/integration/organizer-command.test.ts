// `pocketbase organizer-upsert` creates or updates the single organizer
// account from DIANE_ORGANIZER_EMAIL and DIANE_ORGANIZER_KEY (run by
// `npm run setup` with backend/.env).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POCKETBASE_BIN, pocketbaseArgs } from "../../scripts/paths.js";
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

  function pocketbase(
    args: string[],
    env: Record<string, string>,
    bin = POCKETBASE_BIN,
  ) {
    return spawnSync(bin, pocketbaseArgs(args, { dataDir }), {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...env,
      },
    });
  }

  function upsert(email: string, key: string, bin = POCKETBASE_BIN) {
    return pocketbase(
      ["organizer-upsert"],
      { DIANE_ORGANIZER_EMAIL: email, DIANE_ORGANIZER_KEY: key },
      bin,
    );
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

  /** Starts PocketBase on dataDir and logs in, returning the auth token. */
  async function login(email: string, secret: string): Promise<string> {
    const server = await startPocketBase({ dataDir });
    try {
      const response = await fetch(
        `${server.url}/api/collections/organizers/auth-with-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity: email, password: secret }),
        },
      );
      expect(response.status).toBe(200);
      return ((await response.json()) as { token: string }).token;
    } finally {
      await server.stop();
    }
  }

  /** Starts PocketBase on dataDir and tells whether `token` is still valid. */
  async function isValid(token: string): Promise<boolean> {
    const server = await startPocketBase({ dataDir });
    try {
      const response = await fetch(
        `${server.url}/api/collections/organizers/auth-refresh`,
        { method: "POST", headers: { Authorization: token } },
      );
      return response.status === 200;
    } finally {
      await server.stop();
    }
  }

  it("keeps the app's session when run again with the same email and key", async () => {
    const secret = key();
    upsert(email, secret);
    const token = await login(email, secret);

    const result = upsert(email, secret);

    expect(result.status).toBe(0);
    expect(await isValid(token)).toBe(true);
    const [auth] = await authenticate([{ email, key: secret }]);
    expect(auth).not.toBeNull();
  });

  it("ends the app's session when the key changes", async () => {
    const secret = key();
    upsert(email, secret);
    const token = await login(email, secret);

    const result = upsert(email, key());

    expect(result.status).toBe(0);
    expect(await isValid(token)).toBe(false);
  });

  it("ends the app's session when the email changes", async () => {
    const secret = key();
    const newEmail = "new-organizer@example.com";
    upsert(email, secret);
    const token = await login(email, secret);

    const result = upsert(newEmail, secret);

    expect(result.status).toBe(0);
    expect(await isValid(token)).toBe(false);
    const [withOld, withNew] = await authenticate([
      { email, key: secret },
      { email: newEmail, key: secret },
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

  // PocketBase 0.40.6 turns its dev mode on by default when its binary lives
  // under the OS temporary or cache directory (it then believes it runs from
  // `go run`), and dev mode prints every SQL query with its values.
  it("never prints the email, the key or SQL from a temporary directory", async () => {
    const binDir = await mkdtemp(path.join(tmpdir(), "diane-pb-bin-"));
    try {
      const bin = path.join(binDir, "pocketbase");
      await copyFile(POCKETBASE_BIN, bin);
      await rm(dataDir, { recursive: true, force: true });
      const secret = key();

      const migrated = pocketbase(["migrate", "up"], {}, bin);
      const upserted = upsert(email, secret, bin);
      const output = [migrated, upserted]
        .map((result) => `${result.stdout}${result.stderr}`)
        .join("");

      expect(upserted.status).toBe(0);
      expect(output).not.toContain(email);
      expect(output).not.toContain(secret);
      expect(output).not.toMatch(/\b(SELECT|INSERT|UPDATE)\b/);
    } finally {
      await rm(binDir, { recursive: true, force: true });
    }
  });
});
