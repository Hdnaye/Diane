import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Loaded the way PocketBase hooks load it: as a CommonJS module.
const require = createRequire(import.meta.url);
const { parseSmsReply, POLITE_PHRASES, NO_ONLY_PHRASES } =
  require("../../pb_hooks/lib/sms-reply.cjs") as typeof import("../../pb_hooks/lib/sms-reply.cjs");

describe("POLITE_PHRASES", () => {
  it("is the closed list of courtesy phrases validated with the organizer", () => {
    expect(POLITE_PHRASES).toStrictEqual([
      "merci",
      "merci beaucoup",
      "desole",
      "desolee",
      "bonjour",
      "bonsoir",
      "cordialement",
      "bonne journee",
      "bonne soiree",
    ]);
  });

  it("cannot be changed at runtime", () => {
    expect(Object.isFrozen(POLITE_PHRASES)).toBe(true);
  });
});

describe("NO_ONLY_PHRASES", () => {
  it("lists the courtesy phrases only consistent with a no", () => {
    expect(NO_ONLY_PHRASES).toStrictEqual(["desole", "desolee"]);
    expect(Object.isFrozen(NO_ONLY_PHRASES)).toBe(true);
  });
});

describe("parseSmsReply: apologies", () => {
  // "Sorry" contradicts a yes: such a reply must be checked by a human.
  it.each([
    "Désolé, oui",
    "désolée oui",
    "oui désolé",
    "Oui, désolée !",
    "oui 15 désolée",
    "Bonjour, désolé, oui le 15",
    "oui merci, désolé",
  ])("rejects an apology with a yes: %j", (text) => {
    expect(parseSmsReply(text)).toBeNull();
  });

  it.each([
    ["Non désolé", "no", undefined],
    ["désolée non 15", "no", 15],
    ["Désolé, non merci", "no", undefined],
    ["Bonjour, non le 3, désolée, bonne soirée", "no", 3],
  ] as const)("accepts an apology with a no: %j", (text, answer, day) => {
    expect(parseSmsReply(text)).toStrictEqual(
      day === undefined ? { answer } : { answer, day },
    );
  });

  it.each([
    ["Merci, oui", "yes"],
    ["oui bonne journée", "yes"],
    ["Non merci", "no"],
    ["non cordialement", "no"],
  ] as const)(
    "keeps the other courtesy phrases valid with both answers: %j",
    (text, answer) => {
      expect(parseSmsReply(text)).toStrictEqual({ answer });
    },
  );
});

describe("parseSmsReply: combining marks", () => {
  /** Puts the combining mark `mark` after each character of `text`. */
  const withMark = (text: string, mark: number) =>
    Array.from(text, (char) => char + String.fromCharCode(mark)).join("");

  it.each([
    ["grave", 0x300],
    ["acute", 0x301],
    ["circumflex", 0x302],
    ["tilde", 0x303],
    ["diaeresis", 0x308],
    ["cedilla", 0x327],
  ])("ignores the French %s accent", (_name, mark) => {
    expect(parseSmsReply(withMark("oui", mark))).toStrictEqual({
      answer: "yes",
    });
  });

  it.each([
    ["struck-through (U+0336)", withMark("oui", 0x336)],
    ["slashed (U+0338)", withMark("oui", 0x338)],
    ["one slashed letter (U+0338)", `no${String.fromCharCode(0x338)}n`],
    ["underlined (U+0332)", withMark("oui", 0x332)],
    ["ring above (U+030A)", withMark("oui", 0x30a)],
  ])("rejects other combining marks: %s", (_name, text) => {
    expect(parseSmsReply(text)).toBeNull();
  });
});

describe("parseSmsReply: tolerated noise", () => {
  // A false "yes" skews the head count and the waiting list: only accept
  // noise that cannot change the meaning of the reply.

  it.each([
    ["Oui.", "yes"],
    ["Oui !", "yes"],
    ["OUI!!", "yes"],
    ["Non...", "no"],
    ["Non…", "no"],
    ["oui 👍", "yes"],
    ["👍 Oui", "yes"],
    ["Oui ✅", "yes"],
    ["« Oui »", "yes"],
    ["-- non --", "no"],
    ["Oui ❤️", "yes"],
  ] as const)(
    "accepts punctuation, symbols and emojis around the reply: %j",
    (text, answer) => {
      expect(parseSmsReply(text)).toStrictEqual({ answer });
    },
  );

  it.each([
    ["Oui 15.", "yes", 15],
    ["Oui, 15", "yes", 15],
    ["oui,15", "yes", 15],
    ["OUI : 15", "yes", 15],
    ["oui le 15", "yes", 15],
    ["Non, le 3 !", "no", 3],
    ["Oui - 15", "yes", 15],
  ] as const)(
    "accepts a separator between the reply and the day: %j",
    (text, answer, day) => {
      expect(parseSmsReply(text)).toStrictEqual({ answer, day });
    },
  );

  it.each([
    ["Merci, oui", "yes"],
    ["Merci beaucoup ! Oui", "yes"],
    ["Désolé, non", "no"],
    ["Désolée non", "no"],
    ["Bonjour, oui", "yes"],
    ["Bonsoir oui", "yes"],
    ["Cordialement, oui", "yes"],
    ["Bonne journée, oui", "yes"],
    ["Bonne soirée : non", "no"],
  ] as const)("accepts a courtesy phrase before: %j", (text, answer) => {
    expect(parseSmsReply(text)).toStrictEqual({ answer });
  });

  it.each([
    ["oui merci", "yes"],
    ["OUI merci beaucoup", "yes"],
    ["non désolé", "no"],
    ["Non désolée, bonne journée", "no"],
    ["Oui. Bonne soirée !", "yes"],
    ["oui, cordialement", "yes"],
    ["Non bonjour", "no"],
    ["oui bonsoir", "yes"],
  ] as const)("accepts courtesy phrases after: %j", (text, answer) => {
    expect(parseSmsReply(text)).toStrictEqual({ answer });
  });

  it.each([
    ["Bonjour, oui 15 merci", "yes", 15],
    ["oui 15 merci beaucoup", "yes", 15],
    ["BONSOIR ! Non le 3. Désolée, bonne soirée", "no", 3],
    ["Bonjour oui le 22, merci, cordialement", "yes", 22],
  ] as const)(
    "accepts courtesy phrases around a reply with a day: %j",
    (text, answer, day) => {
      expect(parseSmsReply(text)).toStrictEqual({ answer, day });
    },
  );

  it.each([
    "merci",
    "Bonjour",
    "Merci beaucoup !",
    "👍",
    "...",
    "le 15",
    "oui le",
    "oui merci 15",
    "merci 15 oui",
    "oui beaucoup",
    "oui bonne",
    "oui journée",
    "oui merci bien",
    "oui bonne nuit",
    "oui merci à vous",
    "oui merci d'avance",
  ])(
    "rejects anything outside the closed list of courtesy phrases: %j",
    (text) => {
      expect(parseSmsReply(text)).toBeNull();
    },
  );

  it.each([
    "oui mais pas le 15",
    "oui si il fait beau",
    "oui s'il fait beau",
    "peut-être",
    "Peut être oui",
    "je ne sais pas",
    "oui sauf le 15",
    "oui je pense",
    "plutôt oui",
    "oui ?",
    "Oui?",
  ])("rejects a condition or hesitation: %j", (text) => {
    expect(parseSmsReply(text)).toBeNull();
  });

  it.each([
    "oui non",
    "Non… enfin oui",
    "Oui, non désolé",
    "non merci oui",
    "oui oui",
    "pas oui",
    "non pas oui",
  ])("rejects a contradiction or repetition: %j", (text) => {
    expect(parseSmsReply(text)).toBeNull();
  });

  it.each([
    "oui pour le 15 pas le 22",
    "oui 15 et 22",
    "oui le 15, le 22",
    "oui 15 22",
    "oui 15/22",
    "Oui 15 merci 22",
  ])("rejects several days: %j", (text) => {
    expect(parseSmsReply(text)).toBeNull();
  });

  it.each(["Oui, 32", "oui le 0", "Non : 45 !", "merci, oui 99"])(
    "rejects a day outside 1-31: %j",
    (text) => {
      expect(parseSmsReply(text)).toBeNull();
    },
  );

  it.each([
    "oui你好",
    "oui привет",
    "Оui",
    "oui ١٥",
    "oui ７",
    "oui 1,5",
    "oui 15h",
    "oui 15 h",
  ])("rejects unexpected characters or units: %j", (text) => {
    expect(parseSmsReply(text)).toBeNull();
  });

  it.each([
    "Oui ❓",
    "Oui ❔",
    "oui ⁇",
    "oui ⁉",
    "oui ‽",
    "Oui 🤔",
    "oui 🤷",
    "oui 🤷‍♂️",
    "Oui 👎",
    "Oui ❌",
    "Oui 🚫",
    "oui ≠ 15",
    "oui ½",
    "Oui 👍 🤔",
    "oui * 15",
    "oui / non",
  ])("rejects symbols and emojis outside the closed list: %j", (text) => {
    expect(parseSmsReply(text)).toBeNull();
  });

  it.each([
    "Oui ; merci",
    "'Oui'",
    '"Oui"',
    "(oui)",
    "Oui – merci",
    "Oui — merci",
    "Oui’",
    "Oui 👌",
    "Oui ✔",
    "Oui ✔️",
    "Oui 🙂",
    "Oui 😊",
    "Oui 🙏🏻",
    "Oui ❤",
    "Oui 👍🏿",
    "Oui !",
    "Oui !",
  ])("accepts every separator of the closed list: %j", (text) => {
    expect(parseSmsReply(text)).toStrictEqual({ answer: "yes" });
  });
});

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
