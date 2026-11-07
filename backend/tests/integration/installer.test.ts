// Without any superuser, PocketBase opens its installer page in the browser
// (`xdg-open`, or `open` on macOS). Neither the tests nor `npm run dev` must
// do that: the installer URL is only printed.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKEND_DIR } from "../../scripts/paths.js";
import {
  freePort,
  startPocketBase,
  waitUntilHealthy,
  type PocketBaseProcess,
} from "./pocketbase-process.js";

describe("PocketBase without any superuser", () => {
  let tempDir: string;
  let launched: string;
  /** PATH where fake browser launchers come first and record any call. */
  let fakePath: string;
  const cleanups: (() => Promise<unknown>)[] = [];

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "diane-installer-"));
    launched = path.join(tempDir, "launched");
    const fakeBin = path.join(tempDir, "bin");
    await mkdir(fakeBin);
    for (const name of ["xdg-open", "open"]) {
      await writeFile(
        path.join(fakeBin, name),
        `#!/bin/sh\necho "$0" >> '${launched}'\n`,
        { mode: 0o755 },
      );
    }
    fakePath = `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`;
  });

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.();
    await rm(tempDir, { recursive: true, force: true });
  });

  /** Waits for the installer to run, then tells if a browser was launched. */
  async function browserLaunched(output: () => string): Promise<boolean> {
    // The installer launches the browser, then prints its URL.
    await expect.poll(output, { timeout: 5_000 }).toContain("pbinstall");
    // Give a launcher started asynchronously time to record its call.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return existsSync(launched);
  }

  it("is not opened in the browser by the integration test helper", async () => {
    const pocketbase: PocketBaseProcess = await startPocketBase({
      env: { PATH: fakePath },
    });
    cleanups.push(pocketbase.stop);

    expect(await browserLaunched(pocketbase.output)).toBe(false);
  });

  it("is not opened in the browser by `npm run dev`", async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    const dataDir = path.join(tempDir, "pb_data");
    // Extra flags override dev.js defaults: keep away from the local pb_data/.
    const child: ChildProcess = spawn(
      process.execPath,
      ["scripts/dev.js", `--dir=${dataDir}`, `--http=127.0.0.1:${port}`],
      {
        cwd: BACKEND_DIR,
        env: { ...process.env, PATH: fakePath },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.stderr?.on("data", (chunk) => (output += chunk));
    cleanups.push(async () => {
      if (child.exitCode !== null) return;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await exited;
    });

    await waitUntilHealthy(url, child, () => output);
    expect(await browserLaunched(() => output)).toBe(false);
  });
});
