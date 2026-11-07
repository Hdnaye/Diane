import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { normalizeFrenchPhone } =
  require("../../pb_hooks/lib/phone.cjs") as typeof import("../../pb_hooks/lib/phone.cjs");

describe("normalizeFrenchPhone", () => {
  it.each([
    "0639980001",
    "06 39 98 00 01",
    "06.39.98.00.01",
    "06-39-98-00-01",
    "06/39/98/00/01",
    " 06 39 98 00 01 ",
    "06 39 98 00 01",
    "06 39 98 00 01",
    "+33639980001",
    "+33 6 39 98 00 01",
    "+33 (0)6 39 98 00 01",
    "+33 06 39 98 00 01",
    "0033639980001",
    "0033 6 39 98 00 01",
  ])("normalizes %j to E.164", (input) => {
    expect(normalizeFrenchPhone(input)).toBe("+33639980001");
  });

  it("normalizes landlines too", () => {
    expect(normalizeFrenchPhone("01 23 45 67 89")).toBe("+33123456789");
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["without trunk prefix", "639980001"],
    ["too short", "063998000"],
    ["too long", "06399800012"],
    ["0 after the trunk prefix", "0039980001"],
    ["foreign", "+44 20 7946 0000"],
    ["foreign, 00 prefix", "0044 20 7946 0000"],
    ["letters", "06 39 98 OO 01"],
    ["two numbers", "0639980001 0639980002"],
    ["extension", "0639980001 ext 12"],
    ["plus inside", "06+39980001"],
    ["non-ASCII digits", "٠٦٣٩٩٨٠٠٠١"],
    ["fullwidth digits", "０６３９９８０００１"],
  ])("rejects %s: %j", (_label, input) => {
    expect(normalizeFrenchPhone(input)).toBeNull();
  });
});
