import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

// Node built-ins and Node-only globals are not available in PocketBase's
// embedded JS engine (goja), where pb_hooks/ and pb_migrations/ run.
const nodeOnlyGlobals = [
  "require",
  "module",
  "exports",
  "process",
  "Buffer",
  "global",
  "__dirname",
  "__filename",
  "setImmediate",
  "clearImmediate",
].map((name) => ({
  name,
  message: `'${name}' is a Node global: PocketBase hooks run in goja, not Node. Use the PocketBase JSVM APIs ($app, $os, $http...) instead.`,
}));

export default tseslint.config(
  { ignores: ["bin/", "pb_data/", "node_modules/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["scripts/**", "src/**", "tests/**", "*.config.*"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["tests/**"],
    ...vitest.configs.recommended,
  },
  {
    files: ["pb_hooks/**/*.js", "pb_migrations/**/*.js"],
    languageOptions: {
      sourceType: "script",
      // PocketBase globals ($app, routerAdd, cronAdd...) are declared in
      // pb_data/types.d.ts and checked by `tsc -p tsconfig.pocketbase.json`.
      globals: {},
    },
    rules: {
      "no-undef": "off",
      // `import` is unavailable here: types come from a triple-slash reference.
      "@typescript-eslint/triple-slash-reference": [
        "error",
        { path: "always" },
      ],
      "no-restricted-globals": ["error", ...nodeOnlyGlobals],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression",
          message:
            "Dynamic import() is not supported by PocketBase's JS engine.",
        },
      ],
    },
  },
);
