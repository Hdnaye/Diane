import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { redactAnswerTokens } =
  require("../../pb_hooks/lib/log-redaction.cjs") as typeof import("../../pb_hooks/lib/log-redaction.cjs");

const TOKEN = "A1b2".repeat(10) + "xyz";

describe("redactAnswerTokens", () => {
  it.each([
    [`/api/diane/r/${TOKEN}`, "/api/diane/r/:token"],
    [`/api/diane/r/${TOKEN}?x=1`, "/api/diane/r/:token?x=1"],
    [`/r/${TOKEN}`, "/r/:token"],
    [`/r/${TOKEN}/`, "/r/:token/"],
    [
      `https://diane.example.org/r/${TOKEN}`,
      "https://diane.example.org/r/:token",
    ],
    [
      `https://example.org/diane/r/${TOKEN}#top`,
      "https://example.org/diane/r/:token#top",
    ],
    // Encoded or truncated tokens too.
    ["/api/diane/r/abc%2Fdef", "/api/diane/r/:token"],
  ])("redacts %s", (input, expected) => {
    expect(redactAnswerTokens(input)).toBe(expected);
  });

  it.each([
    "",
    "/api/diane/health",
    "/api/diane/hunts/abc/send-invitations",
    "/api/collections/members/records",
    "https://diane.example.org/",
    "/api/diane/r/",
  ])("leaves %j as it is", (input) => {
    expect(redactAnswerTokens(input)).toBe(input);
  });
});
