// pb_hooks/lib/ modules are unit tested in Node, but run in PocketBase's
// JSVM (goja), whose regular expressions and strings do not always behave
// like V8's. Run them in a real PocketBase and compare with Node.
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HOOKS_DIR } from "../../scripts/paths.js";
import {
  startPocketBase,
  type PocketBaseProcess,
} from "./pocketbase-process.js";

const require = createRequire(import.meta.url);
const { parseSmsReply } =
  require("../../pb_hooks/lib/sms-reply.cjs") as typeof import("../../pb_hooks/lib/sms-reply.cjs");

// Test-only route, added to a copy of pb_hooks/.
const TEST_HOOK = `
routerAdd("POST", "/api/test/sms-reply", (e) => {
  const { parseSmsReply } = require(\`\${__hooks}/lib/sms-reply.cjs\`);
  const inputs = e.requestInfo().body.inputs;
  return e.json(200, inputs.map((text) => parseSmsReply(text)));
});
`;

/** Replies exercising normalization, separators and rejections. */
const SMS_REPLIES = [
  "OUI",
  "non 3",
  "oui15",
  "OUI 015",
  "OUI 32",
  "OUI -3",
  "Ouí",
  "Oúi",
  " OUI ",
  "\tnon\n",
  "Oui.",
  "OUI!!",
  "Non…",
  "« Oui »",
  "oui 👍",
  "👍 Oui",
  "Oui ✅",
  "Oui ❤️",
  "oui 👍🏽",
  "Oui, 15",
  "OUI : 15",
  "oui le 15",
  "Oui - 15",
  "Bonjour, oui 15 merci",
  "Non désolée, bonne journée",
  "oui 15 merci beaucoup",
  "oui ?",
  "oui mais pas le 15",
  "Non… enfin oui",
  "oui pour le 15 pas le 22",
  "oui merci d'avance",
  "oui你好",
  "Оui",
  "oui ١٥",
  "oui ７",
  "",
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
  "Oui 🙏🏻",
  "Oui ✔️",
  "Désolé, oui",
  "oui désolé",
  "oui 15 désolée",
  "Non désolé",
  "désolée non 15",
  // "oui" with combining marks: struck through, slashed, cedilla.
  ...[0x336, 0x338, 0x327].map((mark) =>
    Array.from("oui", (char) => char + String.fromCharCode(mark)).join(""),
  ),
  "Oui !",
];

describe("pb_hooks/lib/ in PocketBase's JSVM", () => {
  let hooksDir: string;
  let pocketbase: PocketBaseProcess;

  beforeAll(async () => {
    hooksDir = await mkdtemp(path.join(tmpdir(), "diane-hooks-"));
    await cp(HOOKS_DIR, hooksDir, { recursive: true });
    await writeFile(path.join(hooksDir, "zz-test-lib.pb.js"), TEST_HOOK);
    pocketbase = await startPocketBase({ hooksDir });
  });

  afterAll(async () => {
    await pocketbase?.stop();
    await rm(hooksDir, { recursive: true, force: true });
  });

  it("parses SMS replies exactly like Node", async () => {
    const response = await fetch(`${pocketbase.url}/api/test/sms-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: SMS_REPLIES }),
    });

    expect(response.status).toBe(200);
    const inJsvm = (await response.json()) as unknown[];
    expect(
      Object.fromEntries(SMS_REPLIES.map((text, i) => [text, inJsvm[i]])),
    ).toStrictEqual(
      Object.fromEntries(
        SMS_REPLIES.map((text) => [text, parseSmsReply(text)]),
      ),
    );
  });
});
