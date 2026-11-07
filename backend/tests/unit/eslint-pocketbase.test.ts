// Checks the ESLint rules guarding code that runs in PocketBase's JSVM
// (pb_hooks/, pb_migrations/): what its CommonJS `require()` accepts, and
// which Node globals stay forbidden.
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { BACKEND_DIR } from "../../scripts/paths.js";

const eslint = new ESLint({ cwd: BACKEND_DIR });

/** Lints `code` as if it lived at `filePath` and returns the rule ids hit. */
async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? "fatal");
}

describe.each(["pb_hooks/example.pb.js", "pb_migrations/1_example.js"])(
  "%s",
  (filePath) => {
    it("allows require() of a module under __hooks", async () => {
      expect(
        await ruleIds(
          "const lib = require(`${__hooks}/lib/sms-reply.cjs`);\nlib;\n",
          filePath,
        ),
      ).toEqual([]);
    });

    it.each([
      ["a Node module", 'require("fs");'],
      ["a node: module", 'require("node:path");'],
      ["a relative path", 'require("./lib/sms-reply.cjs");'],
      ["a template not rooted at __hooks", "require(`lib/${name}.cjs`);"],
      ["a computed path", "require(name);"],
    ])("rejects require() of %s", async (_label, code) => {
      expect(await ruleIds(code, filePath)).toContain("no-restricted-syntax");
    });

    it.each([
      "process.env.HOME;",
      "Buffer.from('x');",
      "__dirname;",
      "module.exports = {};",
    ])("rejects Node globals: %s", async (code) => {
      expect(await ruleIds(code, filePath)).toContain("no-restricted-globals");
    });

    it("rejects dynamic import()", async () => {
      expect(await ruleIds('import("x");', filePath)).toContain(
        "no-restricted-syntax",
      );
    });
  },
);

describe("pb_hooks/lib/ (pure logic shared by hooks and tests)", () => {
  const filePath = "pb_hooks/lib/example.cjs";

  it("allows CommonJS exports and relative require()", async () => {
    expect(
      await ruleIds(
        'const other = require("./other.cjs");\nmodule.exports = { other };\n',
        filePath,
      ),
    ).toEqual([]);
  });

  it.each([
    ["a Node module", 'require("fs");'],
    [
      "a path based on __hooks (undefined under Vitest)",
      "require(`${__hooks}/lib/x.cjs`);",
    ],
  ])("rejects require() of %s", async (_label, code) => {
    expect(await ruleIds(code, filePath)).toContain("no-restricted-syntax");
  });

  it.each(["process.env.HOME;", "Buffer.from('x');", "__dirname;"])(
    "rejects Node globals: %s",
    async (code) => {
      expect(await ruleIds(code, filePath)).toContain("no-restricted-globals");
    },
  );

  it("rejects PocketBase globals, to stay pure", async () => {
    expect(await ruleIds("$app.findRecordById('x', 'y');", filePath)).toContain(
      "no-undef",
    );
  });
});
