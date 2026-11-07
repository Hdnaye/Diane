import { afterEach, describe, expect, it, vi } from "vitest";
import { runSilently } from "../../scripts/run-silently.js";

/** Runs a Node snippet as the child process. */
function node(code: string): [string, string[]] {
  return [process.execPath, ["-e", code]];
}

describe("runSilently", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints nothing when the command succeeds", () => {
    const stdout = vi.spyOn(process.stdout, "write");
    const stderr = vi.spyOn(process.stderr, "write");

    runSilently(...node("console.log('noise'); console.error('more noise');"));

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints the command output and throws when it fails", () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    expect(() =>
      runSilently(
        ...node(
          "console.log('applying 1'); console.error('boom'); process.exit(3);",
        ),
      ),
    ).toThrow(/exit code 3/);

    const printed = stderr.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(printed).toContain("applying 1");
    expect(printed).toContain("boom");
  });
});
