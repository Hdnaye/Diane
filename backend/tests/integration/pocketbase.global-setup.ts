// Vitest global setup for integration tests: starts a throwaway PocketBase
// instance (free port, temporary data dir, test superuser) with this
// project's pb_hooks/ and pb_migrations/, and stops it afterwards.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { TestProject } from "vitest/node";
import {
  HOOKS_DIR,
  MIGRATIONS_DIR,
  POCKETBASE_BIN,
} from "../../scripts/paths.js";

export interface PocketBaseTestInstance {
  url: string;
  superuser: { email: string; password: string };
}

declare module "vitest" {
  export interface ProvidedContext {
    pocketbase: PocketBaseTestInstance;
  }
}

const STARTUP_TIMEOUT_MS = 15_000;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not get a free port"));
      });
    });
  });
}

async function waitUntilHealthy(
  url: string,
  child: ChildProcess,
  output: () => string,
): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `PocketBase exited with code ${child.exitCode}:\n${output()}`,
      );
    }
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PocketBase did not start in time:\n${output()}`);
}

export default async function setup(project: TestProject) {
  if (!existsSync(POCKETBASE_BIN)) {
    throw new Error(
      `PocketBase not found at ${POCKETBASE_BIN}: run \`npm run setup\` first.`,
    );
  }

  const dataDir = await mkdtemp(path.join(tmpdir(), "diane-pb-test-"));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const superuser = {
    email: "superuser@diane.test",
    password: randomBytes(16).toString("hex"),
  };
  const dirFlags = [
    `--dir=${dataDir}`,
    `--hooksDir=${HOOKS_DIR}`,
    `--migrationsDir=${MIGRATIONS_DIR}`,
  ];

  await promisify(execFile)(POCKETBASE_BIN, [
    "superuser",
    "upsert",
    superuser.email,
    superuser.password,
    ...dirFlags,
  ]);

  const child = spawn(
    POCKETBASE_BIN,
    ["serve", `--http=127.0.0.1:${port}`, "--hooksWatch=false", ...dirFlags],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));

  const teardown = async () => {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await exited;
    }
    await rm(dataDir, { recursive: true, force: true });
  };

  try {
    await waitUntilHealthy(url, child, () => output);
  } catch (error) {
    await teardown();
    throw error;
  }

  project.provide("pocketbase", { url, superuser });
  return teardown;
}
