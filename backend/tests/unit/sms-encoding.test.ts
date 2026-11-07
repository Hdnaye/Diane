import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { smsSegments, toGsm7 } =
  require("../../pb_hooks/lib/sms-encoding.cjs") as typeof import("../../pb_hooks/lib/sms-encoding.cjs");

describe("smsSegments", () => {
  it("counts an empty text as no segment", () => {
    expect(smsSegments("")).toStrictEqual({
      encoding: "GSM-7",
      units: 0,
      segments: 0,
    });
  });

  it("uses GSM-7 for French text with accents of the GSM alphabet", () => {
    expect(smsSegments("Répondez à l'invitation, très bien : où ?")).toEqual({
      encoding: "GSM-7",
      units: 41,
      segments: 1,
    });
  });

  it.each([
    ["û (août)", "août"],
    ["ê", "fête"],
    ["ç", "ça"],
    ["typographic apostrophe", "l’heure"],
    ["emoji", "oui 👍"],
  ])("switches to UCS-2 for %s", (_, text) => {
    expect(smsSegments(text).encoding).toBe("UCS-2");
  });

  it("counts characters of the GSM-7 extension table twice", () => {
    expect(smsSegments("{€}")).toEqual({
      encoding: "GSM-7",
      units: 6,
      segments: 1,
    });
  });

  it.each([
    [160, 1],
    [161, 2],
    [306, 2],
    [307, 3],
    [459, 3],
  ])("fits %i GSM-7 characters in %i segment(s)", (length, segments) => {
    expect(smsSegments("a".repeat(length))).toEqual({
      encoding: "GSM-7",
      units: length,
      segments,
    });
  });

  it("never splits an extension character across two segments", () => {
    // 152 septets, then "€" (2 septets) cannot fit in the first segment.
    const text = "a".repeat(152) + "€" + "a".repeat(10);

    expect(smsSegments(text)).toEqual({
      encoding: "GSM-7",
      units: 164,
      segments: 2,
    });
    expect(smsSegments("a".repeat(152) + "€" + "a".repeat(151)).segments).toBe(
      3,
    );
  });

  it.each([
    [70, 1],
    [71, 2],
    [134, 2],
    [135, 3],
  ])("fits %i UCS-2 characters in %i segment(s)", (length, segments) => {
    expect(smsSegments("û".repeat(length))).toEqual({
      encoding: "UCS-2",
      units: length,
      segments,
    });
  });

  it("counts an emoji as two UCS-2 units, never split", () => {
    expect(smsSegments("👍").units).toBe(2);
    // 66 units, then an emoji (2 units) cannot fit in the first segment.
    expect(smsSegments("û".repeat(66) + "👍" + "û".repeat(66)).segments).toBe(
      3,
    );
  });
});

describe("toGsm7", () => {
  it.each([
    ["août", "aout"],
    ["fête", "fete"],
    ["maître", "maitre"],
    ["côte", "cote"],
    ["Noël", "Noel"],
    ["maïs", "mais"],
    ["ça", "ca"],
    ["Ça", "Ça"],
    ["ÀÂÈÊËÎÏÔÛÙ", "AAEEEIIOUU"],
    ["cœur", "coeur"],
    ["l’heure ‘ok’", "l'heure 'ok'"],
    ["« oui » “oui”", '" oui " "oui"'],
    ["8h00 – 9h00 — fin…", "8h00 - 9h00 - fin..."],
    ["8 h 00\tici", "8 h 00 ici"],
  ])("writes %j as %j", (input, expected) => {
    expect(toGsm7(input)).toBe(expected);
  });

  it("keeps the GSM-7 alphabet as it is", () => {
    const gsm =
      "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
      "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà" +
      "^{}\\[~]|€";

    expect(toGsm7(gsm)).toBe(gsm);
    expect(smsSegments(gsm).encoding).toBe("GSM-7");
  });

  it("leaves characters without equivalent as they are", () => {
    expect(toGsm7("oui 👍")).toBe("oui 👍");
  });

  it("makes French text GSM-7", () => {
    const text = toGsm7("Fête du 15 août à 8h00 : ça commence à l’aube…");

    expect(smsSegments(text).encoding).toBe("GSM-7");
  });
});
