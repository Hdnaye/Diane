import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Loaded the way PocketBase hooks load it: as a CommonJS module.
const require = createRequire(import.meta.url);
const { parseSmsReply } =
  require("../../pb_hooks/lib/sms-reply.cjs") as typeof import("../../pb_hooks/lib/sms-reply.cjs");

describe("parseSmsReply", () => {
  it.each([
    ["OUI", "yes"],
    ["NON", "no"],
  ] as const)("recognizes %s", (text, answer) => {
    expect(parseSmsReply(text)).toStrictEqual({ answer });
  });

  it.each(["oui", "Oui", "oUi", "non", "Non"])("ignores case: %s", (text) => {
    expect(parseSmsReply(text)).not.toBeNull();
  });

  it.each([
    ["Ouí", "yes"],
    ["OÛI", "yes"],
    ["nön", "no"],
    ["NÓN", "no"],
  ] as const)("ignores accents: %s", (text, answer) => {
    expect(parseSmsReply(text)).toStrictEqual({ answer });
  });

  it("ignores accents written as combining characters", () => {
    expect(parseSmsReply("Oúi")).toStrictEqual({ answer: "yes" });
  });

  it.each(["  OUI", "OUI  ", "\tOUI\n", " OUI "])(
    "ignores surrounding whitespace: %j",
    (text) => {
      expect(parseSmsReply(text)).toStrictEqual({ answer: "yes" });
    },
  );

  it.each([
    ["OUI 15", "yes", 15],
    ["non 3", "no", 3],
    ["oui   31", "yes", 31],
    [" Non\t1 ", "no", 1],
    ["OUI 05", "yes", 5],
    ["oui15", "yes", 15],
  ] as const)("reads the day of the month: %j", (text, answer, day) => {
    expect(parseSmsReply(text)).toStrictEqual({ answer, day });
  });

  it.each(["OUI 0", "OUI 00", "NON 32", "OUI 99", "OUI 015", "OUI -3"])(
    "rejects a day outside 1-31: %j",
    (text) => {
      expect(parseSmsReply(text)).toBeNull();
    },
  );

  it.each([
    "",
    "   ",
    "O",
    "OU",
    "OUII",
    "NO",
    "NONE",
    "YES",
    "OUI NON",
    "OUI 15 16",
    "OUI 1.5",
    "OUI quinze",
    "OUI merci",
    "Peut-être",
    "15 OUI",
    "0UI",
  ])("returns null for an unrecognized reply: %j", (text) => {
    expect(parseSmsReply(text)).toBeNull();
  });

  it.each([undefined, null, 15, {}])(
    "returns null for a non-string input: %j",
    (input) => {
      expect(parseSmsReply(input as unknown as string)).toBeNull();
    },
  );
});
