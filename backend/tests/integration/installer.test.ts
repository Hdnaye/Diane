import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  startPocketBase,
  type PocketBaseProcess,
} from "./pocketbase-process.js";

// Commands PocketBase may use to open a URL in the user's browser.
const BROWSER_LAUNCHERS = [
  "xdg-open",
  "open",
  "sensible-browser",
  "x-www-browser",
  "www-browser",
];

describe("PocketBase without any superuser", () => {
  let pocketbase: PocketBaseProcess | undefined;
  let fakeBin: string | undefined;

  afterEach(async () => {
    await pocketbase?.stop();
    if (fakeBin) await rm(fakeBin, { recursive: true, force: true });
  });

  it("does not open the installer in the browser", async () => {
    // Fake browser launchers, first in PATH, record any call.
    fakeBin = await mkdtemp(path.join(tmpdir(), "diane-fake-browser-"));
    const launched = path.join(fakeBin, "launched");
    for (const name of BROWSER_LAUNCHERS) {
      await writeFile(
        path.join(fakeBin, name),
        `#!/bin/sh\necho "$0" >> '${launched}'\n`,
        { mode: 0o755 },
      );
    }

    pocketbase = await startPocketBase({
      env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}` },
    });
    const { output } = pocketbase;

    // Tells how to create the first superuser instead.
    await expect.poll(output).toContain("superuser upsert");
    // The installer runs asynchronously after startup: give it time to act.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(existsSync(launched)).toBe(false);
    expect(output()).not.toContain("pbinstall");
  });
});
