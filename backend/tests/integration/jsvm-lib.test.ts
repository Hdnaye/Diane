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
const { normalizeFrenchPhone } =
  require("../../pb_hooks/lib/phone.cjs") as typeof import("../../pb_hooks/lib/phone.cjs");
const { isValidDay, parisToUtc, utcToParis, parseUtcDateTime } =
  require("../../pb_hooks/lib/paris-time.cjs") as typeof import("../../pb_hooks/lib/paris-time.cjs");
const { smsSegments, toGsm7 } =
  require("../../pb_hooks/lib/sms-encoding.cjs") as typeof import("../../pb_hooks/lib/sms-encoding.cjs");
const waitingList =
  require("../../pb_hooks/lib/waiting-list.cjs") as typeof import("../../pb_hooks/lib/waiting-list.cjs");
const invitations =
  require("../../pb_hooks/lib/invitations.cjs") as typeof import("../../pb_hooks/lib/invitations.cjs");
const transports =
  require("../../pb_hooks/lib/transports.cjs") as typeof import("../../pb_hooks/lib/transports.cjs");
const { messageVariables, renderTemplate, renderSms, DEFAULT_TEMPLATE_BODY } =
  require("../../pb_hooks/lib/message-template.cjs") as typeof import("../../pb_hooks/lib/message-template.cjs");

// Test-only route, added to a copy of pb_hooks/.
const TEST_HOOK = `
routerAdd("POST", "/api/test/sms-reply", (e) => {
  const { parseSmsReply } = require(\`\${__hooks}/lib/sms-reply.cjs\`);
  const inputs = e.requestInfo().body.inputs;
  return e.json(200, inputs.map((text) => parseSmsReply(text)));
});

routerAdd("POST", "/api/test/phone", (e) => {
  const { normalizeFrenchPhone } = require(\`\${__hooks}/lib/phone.cjs\`);
  const inputs = e.requestInfo().body.inputs;
  return e.json(200, inputs.map((text) => normalizeFrenchPhone(text)));
});

routerAdd("POST", "/api/test/paris-time", (e) => {
  const lib = require(\`\${__hooks}/lib/paris-time.cjs\`);
  const { days, wallTimes, instants, datetimes } = e.requestInfo().body;
  const iso = (date) => (date ? date.toISOString() : null);
  return e.json(200, {
    days: days.map((day) => lib.isValidDay(day)),
    wallTimes: wallTimes.map(([day, time]) => iso(lib.parisToUtc(day, time))),
    instants: instants.map((instant) => lib.utcToParis(new Date(instant))),
    datetimes: datetimes.map((value) => iso(lib.parseUtcDateTime(value))),
  });
});

routerAdd("POST", "/api/test/message-template", (e) => {
  const lib = require(\`\${__hooks}/lib/message-template.cjs\`);
  const { hunts, body } = e.requestInfo().body;
  return e.json(
    200,
    hunts.flatMap((hunt) =>
      [false, true].flatMap((several) => {
        const variables = lib.messageVariables(hunt, "https://diane.example.org/r/abc", { several });
        return [
          lib.renderTemplate(body, variables),
          lib.renderSms(body, variables),
          lib.renderSms(lib.DEFAULT_TEMPLATE_BODY, variables),
        ];
      }),
    ),
  );
});

routerAdd("POST", "/api/test/waiting-list", (e) => {
  const lib = require(\`\${__hooks}/lib/waiting-list.cjs\`);
  const { answers, lists } = e.requestInfo().body;
  return e.json(200, {
    answers: answers.map((context) => lib.participationAfterAnswer(context)),
    lists: lists.map(([items, max]) => lib.attendance(items, max)),
  });
});

routerAdd("POST", "/api/test/invitations", (e) => {
  const lib = require(\`\${__hooks}/lib/invitations.cjs\`);
  const { hunts, now, urls, instants } = e.requestInfo().body;
  const at = new Date(now);
  return e.json(200, {
    links: urls.map((url) => lib.answerLink(url, "abc")),
    deadlines: instants.map((instant) => lib.defaultDeadline(new Date(instant))),
    hunts: hunts.map((hunt) => ({
      plan: lib.sendPlan(hunt, at),
      refusal: lib.answerRefusal(hunt, at),
      view: lib.publicAnswerView(hunt, { participation: "waiting_list" }, at),
      messages: lib.invitationMessages({
        body: "Battue le {date}.{#plusieurs} OUI {jour}{/plusieurs} {lien}",
        hunt,
        link: "https://diane.example.org/r/abc",
        several: true,
      }),
    })),
  });
});

routerAdd("POST", "/api/test/transports", (e) => {
  const lib = require(\`\${__hooks}/lib/transports.cjs\`);
  const { texts, env } = e.requestInfo().body;
  const config = lib.transportConfig((name) => env[name] || "");
  return e.json(200, {
    config,
    base64: texts.map((text) => lib.base64(text)),
    requests: texts.map((text) =>
      lib.gatewayRequest(config.sms, { to: "+33639981000", text }),
    ),
  });
});

routerAdd("POST", "/api/test/sms-encoding", (e) => {
  const lib = require(\`\${__hooks}/lib/sms-encoding.cjs\`);
  const inputs = e.requestInfo().body.inputs;
  return e.json(
    200,
    inputs.map((text) => ({ size: lib.smsSegments(text), gsm7: lib.toGsm7(text) })),
  );
});
`;

/** Texts exercising both encodings, extension characters and emojis. */
const SMS_TEXTS = [
  "",
  "Répondez à l'invitation",
  "Fête du 15 août, l’heure « exacte »… ça va",
  "{€}[~]|^\\",
  "a".repeat(152) + "€" + "a".repeat(152),
  "û".repeat(66) + "👍" + "û".repeat(66),
  "oui 👍🏽 ❤️",
  "8\u00a0h\u202f00\tici",
];

/** Answers around the limits of a hunt. */
const ANSWER_CONTEXTS = [
  {
    current: "pending",
    answer: "yes",
    maxParticipants: 2,
    presentCount: 1,
    waitingCount: 0,
  },
  {
    current: "pending",
    answer: "yes",
    maxParticipants: 2,
    presentCount: 2,
    waitingCount: 0,
  },
  {
    current: "absent",
    answer: "yes",
    maxParticipants: 2,
    presentCount: 1,
    waitingCount: 1,
  },
  {
    current: "pending",
    answer: "yes",
    maxParticipants: 0,
    presentCount: 9,
    waitingCount: 0,
  },
  {
    current: "waiting_list",
    answer: "yes",
    maxParticipants: 2,
    presentCount: 0,
    waitingCount: 0,
  },
  {
    current: "present",
    answer: "no",
    maxParticipants: 2,
    presentCount: 1,
    waitingCount: 0,
  },
] as const;
const ATTENDANCE_LISTS: [
  { id: string; participation: string; answered_at: string }[],
  number,
][] = [
  [
    [
      {
        id: "b",
        participation: "waiting_list",
        answered_at: "2026-11-01 12:00:00.000Z",
      },
      {
        id: "a",
        participation: "waiting_list",
        answered_at: "2026-11-01 12:00:00.000Z",
      },
      {
        id: "c",
        participation: "waiting_list",
        answered_at: "2026-11-01 11:00:00.000Z",
      },
      {
        id: "d",
        participation: "present",
        answered_at: "2026-11-01 10:00:00.000Z",
      },
      { id: "e", participation: "pending", answered_at: "" },
    ],
    1,
  ],
  [[{ id: "a", participation: "present", answered_at: "" }], 0],
];

/** Hunts around sending and answering limits, at INVITATION_NOW. */
const INVITATION_NOW = "2026-11-08T10:00:00.000Z";
const INVITATION_HUNTS = [
  {
    date: "2026-11-14",
    meeting_time: "08:00",
    response_deadline: "2026-11-12 17:00:00.000Z",
    status: "draft",
  },
  {
    date: "2027-08-14",
    meeting_time: "07:30",
    response_deadline: "",
    status: "invitations_sent",
  },
  {
    date: "2026-11-10",
    meeting_time: "08:00",
    response_deadline: "",
    status: "draft",
  },
  // Around the default deadline (2026-11-10 20:00 Paris).
  {
    date: "2026-11-10",
    meeting_time: "20:00",
    response_deadline: "",
    status: "draft",
  },
  {
    date: "2026-11-10",
    meeting_time: "20:01",
    response_deadline: "",
    status: "draft",
  },
  {
    date: "2026-11-14",
    meeting_time: "08:00",
    response_deadline: "2026-11-08 10:00:00.000Z",
    status: "draft",
  },
  {
    date: "2026-11-14",
    meeting_time: "08:00",
    response_deadline: "2026-11-12 17:00:00.000Z",
    status: "cancelled",
  },
  {
    date: "2026-11-14",
    meeting_time: "08:00",
    response_deadline: "2026-11-12 17:00:00.000Z",
    status: "closed",
  },
];
/** Sending times around midnight, daylight saving switches and year ends. */
const DEADLINE_INSTANTS = [
  "2026-11-08T22:59:00.000Z",
  "2026-11-08T23:30:00.000Z",
  "2026-03-27T12:00:00.000Z",
  "2026-10-23T22:30:00.000Z",
  "2026-12-30T15:00:00.000Z",
  "2028-02-27T12:00:00.000Z",
];
const PUBLIC_URLS = [
  "https://diane.example.org/",
  "https://example.org/diane//",
  "diane.example.org",
  "",
];
const TRANSPORT_TEXTS = [
  "",
  "f",
  "fo",
  "sms:secret",
  "é€👍",
  "Battue le 15 aout\n",
];
const TRANSPORT_ENV = {
  DIANE_SMS_GATEWAY_URL: " https://api.sms-gate.app/3rdparty/v1/ ",
  DIANE_SMS_GATEWAY_USERNAME: "sms",
  DIANE_SMS_GATEWAY_PASSWORD: "pässwörd",
  DIANE_EMAIL_TRANSPORT: "fake",
};

/** Phone numbers exercising separators and rejections. */
const PHONES = [
  "06 39 98 00 01",
  "06.39.98.00.01",
  "06\u00a039\u00a098\u00a000\u00a001",
  "06\u202f39\u202f98\u202f00\u202f01",
  "06\t39\n98 00 01",
  "+33 (0)6 39 98 00 01",
  "+33 06 39 98 00 01",
  "0033 6 39 98 00 01",
  "+44 20 7946 0000", // Ofcom range reserved for drama (fictitious).
  "٠٦٣٩٩٨٠٠٠١",
  "０６３９９８０００１",
  "06 39 98 OO 01",
  "",
];

/** Days and instants around daylight saving switches. */
const DAYS = ["2026-11-14", "2028-02-29", "2026-02-29", "2026-1-14", ""];
const WALL_TIMES = [
  ["2026-11-14", "08:00"],
  ["2026-07-14", "08:00"],
  ["2026-03-29", "01:59"],
  ["2026-03-29", "03:00"],
  ["2026-10-25", "01:00"],
  ["2026-10-25", "08:00"],
];
const INSTANTS = [
  "2026-11-12T17:00:00.000Z",
  "2026-07-14T22:30:00.000Z",
  "2026-03-29T01:00:00.000Z",
  "2026-10-25T00:59:00.000Z",
  "2026-10-25T01:00:00.000Z",
];
const DATETIMES = [
  "2026-11-12 17:00:00.000Z",
  "2026-11-12 17:00:00Z",
  "2026-11-12T17:00:00.123Z",
  "2026-11-12",
  "",
];

/** Hunts rendered with every template variable. */
const TEMPLATE_BODY =
  "Battue le {date} à {heure}. OUI {jour}. Avant le {limite}. {lien} {inconnu}\n" +
  "{#plusieurs}OUI {jour}{/plusieurs}\nFin{#plusieurs} (plusieurs){/plusieurs}\n" +
  "{#inconnu}A\nB{/inconnu}\n{#plusieurs}ouvert";
const HUNTS = [
  {
    date: "2026-11-14",
    meeting_time: "08:00",
    response_deadline: "2026-11-12 17:00:00.000Z",
  },
  { date: "2026-11-01", meeting_time: "07:30", response_deadline: "" },
  {
    date: "2027-08-15",
    meeting_time: "14:05",
    response_deadline: "2027-08-13 22:30:00.000Z",
  },
  {
    date: "2027-02-09",
    meeting_time: "09:00",
    response_deadline: "2027-02-01 08:00:00.000Z",
  },
];

/** POSTs `body` to a test route of the JSVM instance. */
async function inJsvm(url: string, route: string, body: unknown) {
  const response = await fetch(`${url}/api/test/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return response.json();
}

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

  it("normalizes phone numbers exactly like Node", async () => {
    const jsvm = (await inJsvm(pocketbase.url, "phone", {
      inputs: PHONES,
    })) as unknown[];

    expect(
      Object.fromEntries(PHONES.map((text, i) => [text, jsvm[i]])),
    ).toStrictEqual(
      Object.fromEntries(
        PHONES.map((text) => [text, normalizeFrenchPhone(text)]),
      ),
    );
  });

  it("converts Paris times exactly like Node", async () => {
    const iso = (date: Date | null) => (date ? date.toISOString() : null);

    expect(
      await inJsvm(pocketbase.url, "paris-time", {
        days: DAYS,
        wallTimes: WALL_TIMES,
        instants: INSTANTS,
        datetimes: DATETIMES,
      }),
    ).toStrictEqual({
      days: DAYS.map((day) => isValidDay(day)),
      wallTimes: WALL_TIMES.map(([day, time]) =>
        iso(parisToUtc(String(day), String(time))),
      ),
      instants: INSTANTS.map((instant) => utcToParis(new Date(instant))),
      datetimes: DATETIMES.map((value) => iso(parseUtcDateTime(value))),
    });
  });

  it("applies the waiting list exactly like Node", async () => {
    expect(
      await inJsvm(pocketbase.url, "waiting-list", {
        answers: ANSWER_CONTEXTS,
        lists: ATTENDANCE_LISTS,
      }),
    ).toStrictEqual({
      answers: ANSWER_CONTEXTS.map((context) =>
        waitingList.participationAfterAnswer(context),
      ),
      lists: ATTENDANCE_LISTS.map(([items, max]) =>
        waitingList.attendance(items, max),
      ),
    });
  });

  it("applies invitation rules exactly like Node", async () => {
    const at = new Date(INVITATION_NOW);

    expect(
      await inJsvm(pocketbase.url, "invitations", {
        hunts: INVITATION_HUNTS,
        now: INVITATION_NOW,
        urls: PUBLIC_URLS,
        instants: DEADLINE_INSTANTS,
      }),
    ).toStrictEqual({
      links: PUBLIC_URLS.map((url) => invitations.answerLink(url, "abc")),
      deadlines: DEADLINE_INSTANTS.map((instant) =>
        invitations.defaultDeadline(new Date(instant)),
      ),
      hunts: INVITATION_HUNTS.map((hunt) => ({
        plan: invitations.sendPlan(hunt, at),
        refusal: invitations.answerRefusal(hunt, at),
        view: invitations.publicAnswerView(
          hunt,
          { participation: "waiting_list" },
          at,
        ),
        messages: invitations.invitationMessages({
          body: "Battue le {date}.{#plusieurs} OUI {jour}{/plusieurs} {lien}",
          hunt,
          link: "https://diane.example.org/r/abc",
          several: true,
        }),
      })),
    });
  });

  it("builds transport requests exactly like Node", async () => {
    const config = transports.transportConfig(
      (name) => (TRANSPORT_ENV as Record<string, string>)[name] ?? "",
    );

    expect(
      await inJsvm(pocketbase.url, "transports", {
        texts: TRANSPORT_TEXTS,
        env: TRANSPORT_ENV,
      }),
    ).toStrictEqual({
      config,
      base64: TRANSPORT_TEXTS.map((text) => transports.base64(text)),
      requests: TRANSPORT_TEXTS.map((text) =>
        transports.gatewayRequest(config.sms, { to: "+33639981000", text }),
      ),
    });
  });

  it("sizes and transliterates SMS exactly like Node", async () => {
    expect(
      await inJsvm(pocketbase.url, "sms-encoding", { inputs: SMS_TEXTS }),
    ).toStrictEqual(
      SMS_TEXTS.map((text) => ({
        size: smsSegments(text),
        gsm7: toGsm7(text),
      })),
    );
  });

  it("renders message templates exactly like Node", async () => {
    expect(
      await inJsvm(pocketbase.url, "message-template", {
        hunts: HUNTS,
        body: TEMPLATE_BODY,
      }),
    ).toStrictEqual(
      HUNTS.flatMap((hunt) =>
        [false, true].flatMap((several) => {
          const variables = messageVariables(
            hunt,
            "https://diane.example.org/r/abc",
            { several },
          );
          return [
            renderTemplate(TEMPLATE_BODY, variables),
            renderSms(TEMPLATE_BODY, variables),
            renderSms(DEFAULT_TEMPLATE_BODY, variables),
          ];
        }),
      ),
    );
  });
});
