import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * Runs a command, discarding its output when it succeeds. When it fails, its
 * output (stdout then stderr) is printed to stderr and an error is thrown.
 *
 * @param {string} file
 * @param {string[]} args
 */
export function runSilently(file, args) {
  const result = spawnSync(file, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout}${result.stderr}`);
    const reason =
      result.signal !== null
        ? `signal ${result.signal}`
        : `exit code ${result.status}`;
    throw new Error(
      `\`${path.basename(file)} ${args.join(" ")}\` failed (${reason}).`,
    );
  }
}
