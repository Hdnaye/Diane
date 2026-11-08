// The members' answer page (pb_public/answer/, served for /r/{token}):
// a standalone page, with the colors of the app's design tokens, that
// loads nothing from a third party and never knows the organizer key
// (CLAUDE.md, "Librairies front", "Secrets", RGPD).
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BACKEND_DIR } from "../../scripts/paths.js";

const PAGE_DIR = path.join(BACKEND_DIR, "pb_public", "answer");
const TOKENS_FILE = path.join(
  BACKEND_DIR,
  "..",
  "app",
  "src",
  "theme",
  "tokens.js",
);

const read = (name: string) => readFile(path.join(PAGE_DIR, name), "utf8");

/** Every file of the page, recursively, relative to PAGE_DIR. */
async function pageFiles(): Promise<string[]> {
  const entries = await readdir(PAGE_DIR, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(PAGE_DIR, path.join(entry.parentPath, entry.name)),
    );
}

const CODE_FILES = /\.(html|css|js)$/;

/** References to another site. */
const EXTERNAL = [
  /https?:\/\//i,
  /(src|href)\s*=\s*["']?\/\//i,
  /url\(\s*["']?\/\//i,
  /@import/i,
];

/** The organizer key, its variables, cookies and browser storage. */
const FORBIDDEN = [
  /EXPO_PUBLIC/,
  /DIANE_ORGANIZER/i,
  /organizer/i,
  /Authorization/i,
  /\/api\/collections/,
  /document\.cookie/,
  /localStorage|sessionStorage|indexedDB/,
];

/** The patterns found in `text`. */
const found = (text: string, patterns: RegExp[]) =>
  patterns.filter((pattern) => pattern.test(text)).map(String);

type Colors = Record<string, string | Record<string, string>>;

describe("answer page files", () => {
  describe("colors", () => {
    const { colors } = createRequire(import.meta.url)(TOKENS_FILE) as {
      colors: Colors;
    };

    /** `--primary-foreground` -> colors.primary.foreground, etc. */
    function tokenColor(variable: string): string | undefined {
      const [group = "", ...rest] = variable.split("-");
      const token = colors[group];
      if (typeof token === "string") return rest.length ? undefined : token;
      if (!token) return undefined;
      return token[rest.length ? rest.join("-") : "DEFAULT"];
    }

    async function cssColorVariables(): Promise<[string, string][]> {
      const css = await read("answer.css");
      return [...css.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map(
        (match) => [match[1] ?? "", match[2] ?? ""],
      );
    }

    it("copies the design tokens of the app", async () => {
      const variables = await cssColorVariables();

      expect(variables.length).toBeGreaterThan(0);
      for (const [name, value] of variables) {
        const token = tokenColor(name);
        expect(token, `--${name} is not a color token`).toBeDefined();
        expect(value.toUpperCase(), `--${name}`).toBe(token?.toUpperCase());
      }
    });

    it("uses the main colors of the visual identity", async () => {
      const names = (await cssColorVariables()).map(([name]) => name);

      for (const name of [
        "background",
        "foreground",
        "primary",
        "primary-foreground",
        "danger",
        "danger-foreground",
        "warning",
        "warning-foreground",
        "ring",
      ]) {
        expect(names).toContain(name);
      }
    });

    it("uses no color outside of the copied tokens", async () => {
      const css = await read("answer.css");
      const withoutVariables = css.replace(
        /--[a-z-]+:\s*#[0-9a-fA-F]{3,8}\s*;/g,
        "",
      );

      expect(withoutVariables).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(withoutVariables).not.toMatch(/\b(rgb|hsl)a?\(/);
    });
  });

  describe("third parties and secrets", () => {
    it("loads nothing from another site", async () => {
      for (const file of await pageFiles()) {
        if (!CODE_FILES.test(file)) continue;
        expect({ file, found: found(await read(file), EXTERNAL) }).toEqual({
          file,
          found: [],
        });
      }
    });

    it("never refers to the organizer key, cookies or browser storage", async () => {
      for (const file of await pageFiles()) {
        if (!CODE_FILES.test(file)) continue;
        expect({ file, found: found(await read(file), FORBIDDEN) }).toEqual({
          file,
          found: [],
        });
      }
    });

    it("only calls the public answer routes", async () => {
      const js = (
        await Promise.all(
          (await pageFiles())
            .filter((file) => file.endsWith(".js"))
            .map((file) => read(file)),
        )
      ).join("\n");

      const apiPaths = [...js.matchAll(/["'`](\/api\/[^"'`$]*)/g)].map(
        (match) => match[1],
      );
      expect(apiPaths.length).toBeGreaterThan(0);
      for (const apiPath of apiPaths) {
        expect(apiPath).toBe("/api/diane/r/");
      }
    });
  });

  describe("index.html", () => {
    it("is a French page that sends no Referer", async () => {
      const html = await read("index.html");

      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toMatch(/<html lang="fr">/);
      expect(html).toMatch(/<meta name="referrer" content="no-referrer"/);
      expect(html).toMatch(/<meta\s+name="viewport"/);
    });

    it("has no inline script or style (Content-Security-Policy)", async () => {
      const html = await read("index.html");

      expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
      expect(html).not.toMatch(/<style/);
      expect(html).not.toMatch(/\sstyle=/);
      expect(html).not.toMatch(/\son[a-z]+=/);
    });

    it("announces the confirmation to screen readers", async () => {
      const html = await read("index.html");

      expect(html).toMatch(/aria-live="polite"/);
    });
  });

  describe("font", () => {
    it("serves Atkinson Hyperlegible locally, with its license", async () => {
      const files = await pageFiles();
      const css = await read("answer.css");

      const fonts = files.filter((file) => file.endsWith(".ttf"));
      expect(fonts.length).toBeGreaterThanOrEqual(2);
      for (const font of fonts) {
        expect(css).toContain(`/answer/${font}`);
      }
      const license = files.find((file) => /OFL/.test(file));
      expect(license).toBeDefined();
      expect(await read(license ?? "")).toMatch(/SIL OPEN FONT LICENSE/);
      expect(css).toMatch(/font-family:\s*"Atkinson Hyperlegible"/);
    });
  });

  it("gives the answer buttons at least 56 px of height", async () => {
    const css = await read("answer.css");

    const height = /\.button\s*\{[^}]*min-height:\s*([\d.]+)rem/.exec(css);
    expect(Number(height?.[1]) * 16).toBeGreaterThanOrEqual(56);
  });
});
