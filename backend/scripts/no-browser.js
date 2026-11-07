// Without any superuser, `pocketbase serve` opens its installer page in the
// browser of whoever runs it, with no flag or environment variable to
// prevent it (PocketBase 0.40.6, tools/osutils LaunchURL). It runs
// `xdg-open` (`open` on macOS) through PATH: putting no-op commands with
// those names first in PocketBase's PATH keeps the browser closed. The
// installer URL is still printed.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { BACKEND_DIR } from "./paths.js";

/** Directory of the no-op launchers (git-ignored, generated on demand). */
export const NO_BROWSER_DIR = path.join(BACKEND_DIR, "bin", "no-browser");

const LAUNCHERS = ["xdg-open", "open"];
const NO_OP = "#!/bin/sh\n# Keeps PocketBase from opening a browser.\nexit 0\n";

/**
 * Returns a copy of `env` in which PocketBase cannot open a browser.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function withoutBrowser(env) {
  mkdirSync(NO_BROWSER_DIR, { recursive: true });
  for (const name of LAUNCHERS) {
    const file = path.join(NO_BROWSER_DIR, name);
    // Generated rather than committed: the executable bit is not always
    // preserved, and a non-executable file would be skipped from PATH.
    if (!existsSync(file) || readFileSync(file, "utf8") !== NO_OP) {
      writeFileSync(file, NO_OP);
    }
    chmodSync(file, 0o755);
  }
  return {
    ...env,
    PATH: [NO_BROWSER_DIR, env.PATH].filter(Boolean).join(path.delimiter),
  };
}
