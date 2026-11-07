// Globals provided by PocketBase's JS engine but missing from the generated
// pb_data/types.d.ts.

declare const console: {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};

/**
 * CommonJS loader for local modules, e.g. require(`${__hooks}/lib/x.cjs`).
 * Type the result with a JSDoc cast:
 * `/** @type {typeof import("./lib/x.cjs")} *\/ (require(...))`.
 */
declare function require(id: string): unknown;
