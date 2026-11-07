import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

// pb_hooks/ and pb_migrations/ run in PocketBase's JSVM (goja), not in Node.
// It offers a CommonJS `require()` for local files, but no Node built-in
// modules, no ESM, and only partial stubs (if any) of Node's globals.
const JSVM_HINT =
  "Use the PocketBase JSVM APIs ($app, $os, $security, $http...) instead.";

/** @param {string[]} names */
const forbidNodeGlobals = (names) =>
  names.map((name) => ({
    name,
    message: `'${name}' is a Node global: PocketBase's JSVM (goja) does not provide it, or only a partial stub. ${JSVM_HINT}`,
  }));

const NODE_GLOBALS = [
  "process",
  "Buffer",
  "global",
  "__dirname",
  "__filename",
  "setImmediate",
  "clearImmediate",
];

const forbidDynamicImport = {
  selector: "ImportExpression",
  message: "Dynamic import() is not supported by PocketBase's JSVM (goja).",
};

export default defineConfig(
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
    // Hooks and migrations: plain scripts evaluated by PocketBase.
    files: ["pb_hooks/**/*.js", "pb_migrations/**/*.js"],
    ignores: ["pb_hooks/lib/**"],
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
      "@typescript-eslint/no-require-imports": "off",
      "no-restricted-globals": [
        "error",
        ...forbidNodeGlobals([...NODE_GLOBALS, "module", "exports"]),
      ],
      "no-restricted-syntax": [
        "error",
        forbidDynamicImport,
        {
          // The JSVM resolves bare and relative paths against node_modules or
          // the working directory, not the hook file: root them at __hooks.
          selector:
            "CallExpression[callee.name='require']:not([arguments.0.type='TemplateLiteral'][arguments.0.quasis.0.value.raw=''][arguments.0.expressions.0.name='__hooks'])",
          message:
            "Only require local modules through a path rooted at __hooks, e.g. require(`${__hooks}/lib/sms-reply.cjs`): Node modules do not exist in PocketBase's JSVM (goja).",
        },
      ],
    },
  },
  {
    // Pure business logic shared by hooks (`require(`${__hooks}/lib/x.cjs`)`)
    // and Vitest (`createRequire`): CommonJS, no Node, no PocketBase globals.
    files: ["pb_hooks/lib/**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: {} },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-restricted-globals": ["error", ...forbidNodeGlobals(NODE_GLOBALS)],
      "no-restricted-syntax": [
        "error",
        forbidDynamicImport,
        {
          selector:
            "CallExpression[callee.name='require']:not([arguments.0.type='Literal'][arguments.0.value=/^\\.\\.?\\u002F/])",
          message:
            "pb_hooks/lib/ modules may only require other lib modules by relative path, e.g. require('./x.cjs'): __hooks is undefined under Vitest and Node modules do not exist in PocketBase's JSVM (goja).",
        },
      ],
    },
  },
);
