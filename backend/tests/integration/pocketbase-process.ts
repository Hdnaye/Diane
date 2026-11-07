// Starts throwaway PocketBase instances (free port, temporary data dir) with
// this project's pb_hooks/ and pb_migrations/.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  HOOKS_DIR,
  MIGRATIONS_DIR,
  POCKETBASE_BIN,
} from "../../scripts/paths.js";
import { withoutBrowser } from "../../scripts/no-browser.js";

const STARTUP_TIMEOUT_MS = 15_000;

export interface PocketBaseOptions {
  /** Superuser created before `serve`; none when omitted. */
  superuser?: { email: string; password: string };
  /** Extra environment variables for the PocketBase process. */
  env?: NodeJS.ProcessEnv;
  /** Hooks directory; this project's pb_hooks/ when omitted. */
  hooksDir?: string;
}

export interface PocketBaseProcess {
  url: string;
  /** Everything PocketBase printed so far (stdout and stderr). */
  output(): string;
  /** Stops PocketBase and deletes its data directory. */
  stop(): Promise<void>;
}

export function freePort(): Promise<number> {
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

export async function waitUntilHealthy(
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

export async function startPocketBase(
  options: PocketBaseOptions = {},
): Promise<PocketBaseProcess> {
  if (!existsSync(POCKETBASE_BIN)) {
    throw new Error(
      `PocketBase not found at ${POCKETBASE_BIN}: run \`npm run setup\` first.`,
    );
  }

  const dataDir = await mkdtemp(path.join(tmpdir(), "diane-pb-test-"));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const env = withoutBrowser({ ...process.env, ...options.env });
  const dirFlags = [
    `--dir=${dataDir}`,
    `--hooksDir=${options.hooksDir ?? HOOKS_DIR}`,
    `--migrationsDir=${MIGRATIONS_DIR}`,
  ];

  if (options.superuser) {
    await promisify(execFile)(
      POCKETBASE_BIN,
      [
        "superuser",
        "upsert",
        options.superuser.email,
        options.superuser.password,
        ...dirFlags,
      ],
      { env },
    );
  }

  const child = spawn(
    POCKETBASE_BIN,
    ["serve", `--http=127.0.0.1:${port}`, "--hooksWatch=false", ...dirFlags],
    { stdio: ["ignore", "pipe", "pipe"], env },
  );
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));

  const stop = async () => {
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
    await stop();
    throw error;
  }

  return { url, output: () => output, stop };
}
