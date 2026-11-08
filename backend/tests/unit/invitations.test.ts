import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  answerLink,
  defaultDeadline,
  sendPlan,
  answerRefusal,
  isOpenInvitation,
  publicAnswerView,
  invitationMessages,
  sendSummary,
  channelsToResend,
  STALE_SENDING_MS,
  toPocketBaseDate,
} =
  require("../../pb_hooks/lib/invitations.cjs") as typeof import("../../pb_hooks/lib/invitations.cjs");

const NOW = new Date("2026-11-08T10:00:00.000Z");

const hunt = (fields: Record<string, unknown> = {}) => ({
  date: "2026-11-14",
  meeting_time: "08:00",
  response_deadline: "2026-11-12 17:00:00.000Z",
  status: "draft",
  ...fields,
});

describe("toPocketBaseDate", () => {
  it("writes a date like PocketBase", () => {
    expect(toPocketBaseDate(new Date("2026-11-12T17:00:00.000Z"))).toBe(
      "2026-11-12 17:00:00.000Z",
    );
  });
});

describe("answerLink", () => {
  it.each([
    ["https://diane.example.org", "https://diane.example.org/r/abc"],
    ["https://diane.example.org/", "https://diane.example.org/r/abc"],
    ["https://example.org/diane//", "https://example.org/diane/r/abc"],
    ["http://192.168.1.10:8090", "http://192.168.1.10:8090/r/abc"],
  ])("builds the link from %j", (publicUrl, expected) => {
    expect(answerLink(publicUrl, "abc")).toBe(expected);
  });

  it.each(["", "  ", "diane.example.org", "ftp://example.org", "https://a b"])(
    "refuses a missing or invalid public URL (%j)",
    (publicUrl) => {
      expect(answerLink(publicUrl, "abc")).toBeNull();
    },
  );
});

describe("defaultDeadline", () => {
  it.each([
    // Sunday 11:00 Paris (CET) -> Tuesday 20:00 Paris.
    ["2026-11-08T10:00:00.000Z", "2026-11-10 19:00:00.000Z"],
    // Just after midnight in Paris (still the previous day in UTC): day + 2
    // counts from the Paris day.
    ["2026-11-08T23:30:00.000Z", "2026-11-11 19:00:00.000Z"],
    // Just before midnight in Paris.
    ["2026-11-08T22:59:00.000Z", "2026-11-10 19:00:00.000Z"],
    // Summer time (CEST, UTC+2).
    ["2026-07-14T08:00:00.000Z", "2026-07-16 18:00:00.000Z"],
    // Friday in winter time, deadline on Sunday after the switch to summer time.
    ["2026-03-27T12:00:00.000Z", "2026-03-29 18:00:00.000Z"],
    // Across a month and a year.
    ["2026-12-30T15:00:00.000Z", "2027-01-01 19:00:00.000Z"],
  ])("from %s is %s", (now, expected) => {
    expect(defaultDeadline(new Date(now))).toBe(expected);
  });
});

describe("sendPlan", () => {
  it("accepts a hunt whose deadline is ahead, deadline unchanged", () => {
    expect(sendPlan(hunt(), NOW)).toStrictEqual({ ok: true, deadline: null });
  });

  it("accepts a hunt whose invitations were already sent", () => {
    expect(sendPlan(hunt({ status: "invitations_sent" }), NOW).ok).toBe(true);
  });

  it.each([
    ["cancelled", "hunt_cancelled"],
    ["closed", "hunt_closed"],
  ])("refuses a %s hunt", (status, code) => {
    expect(sendPlan(hunt({ status }), NOW)).toMatchObject({ ok: false, code });
  });

  it("refuses a hunt whose deadline has passed", () => {
    expect(
      sendPlan(hunt({ response_deadline: "2026-11-08 09:59:59.000Z" }), NOW),
    ).toMatchObject({ ok: false, code: "deadline_passed" });
    expect(
      sendPlan(hunt({ response_deadline: "2026-11-08 10:00:00.000Z" }), NOW),
    ).toMatchObject({ ok: false, code: "deadline_passed" });
  });

  it("sets the default deadline (day + 2, 20:00 Paris) when there is none", () => {
    // Sunday 2026-11-08 11:00 Paris -> Tuesday 2026-11-10 20:00 Paris (CET).
    expect(sendPlan(hunt({ response_deadline: "" }), NOW)).toStrictEqual({
      ok: true,
      deadline: "2026-11-10 19:00:00.000Z",
    });
  });

  it.each([
    // The hunt starts before the default deadline, or at the same time.
    ["2026-11-10", "08:00"],
    ["2026-11-10", "20:00"],
  ])(
    "refuses without deadline when the hunt (%s %s) starts before day + 2, 20:00",
    (date, meeting_time) => {
      expect(
        sendPlan(hunt({ date, meeting_time, response_deadline: "" }), NOW),
      ).toMatchObject({
        ok: false,
        code: "deadline_missing",
        message: expect.stringMatching(/date limite/),
      });
    },
  );

  it("accepts without deadline a hunt starting after day + 2, 20:00", () => {
    expect(
      sendPlan(
        hunt({
          date: "2026-11-10",
          meeting_time: "20:01",
          response_deadline: "",
        }),
        NOW,
      ),
    ).toStrictEqual({ ok: true, deadline: "2026-11-10 19:00:00.000Z" });
  });

  it("gives a French message with each refusal", () => {
    const refusal = sendPlan(hunt({ status: "cancelled" }), NOW);

    expect(refusal).toMatchObject({
      ok: false,
      message: expect.stringMatching(/annulée/),
    });
  });
});

describe("answerRefusal", () => {
  it("accepts an answer before the deadline", () => {
    expect(answerRefusal(hunt(), NOW)).toBeNull();
  });

  it.each([
    [{ status: "cancelled" }, "hunt_cancelled"],
    [{ status: "closed" }, "hunt_closed"],
    [{ response_deadline: "2026-11-08 10:00:00.000Z" }, "deadline_passed"],
    // Without deadline, until the hunt starts.
    [{ response_deadline: "", date: "2026-11-08" }, "deadline_passed"],
  ])("refuses %j (%s)", (fields, code) => {
    expect(answerRefusal(hunt(fields), NOW)).toMatchObject({ code });
  });

  it("accepts an answer without deadline before the hunt", () => {
    expect(answerRefusal(hunt({ response_deadline: "" }), NOW)).toBeNull();
  });
});

describe("isOpenInvitation", () => {
  it("is open while pending and answerable", () => {
    expect(isOpenInvitation({ participation: "pending" }, hunt(), NOW)).toBe(
      true,
    );
  });

  it.each([
    [{ participation: "present" }, hunt()],
    [{ participation: "pending" }, hunt({ status: "cancelled" })],
    [
      { participation: "pending" },
      hunt({ response_deadline: "2026-11-01 10:00:00.000Z" }),
    ],
  ])("is closed for %j", (invitation, h) => {
    expect(isOpenInvitation(invitation, h, NOW)).toBe(false);
  });
});

describe("publicAnswerView", () => {
  it("shows only the hunt, the deadline and the member's own answer", () => {
    expect(
      publicAnswerView(hunt(), { participation: "waiting_list" }, NOW),
    ).toStrictEqual({
      hunt: {
        date: "2026-11-14",
        date_label: "samedi 14 novembre",
        meeting_time: "08:00",
        time_label: "8h00",
        cancelled: false,
      },
      deadline: "2026-11-12 17:00:00.000Z",
      deadline_label: "jeudi 12 novembre à 18h00",
      participation: "waiting_list",
      answer: "yes",
      can_answer: true,
      refusal: null,
    });
  });

  it.each([
    ["pending", null],
    ["present", "yes"],
    ["absent", "no"],
  ])("derives the answer from %s", (participation, answer) => {
    expect(publicAnswerView(hunt(), { participation }, NOW).answer).toBe(
      answer,
    );
  });

  it("tells when the answer can no longer change, and why", () => {
    const view = publicAnswerView(
      hunt({ status: "cancelled" }),
      { participation: "present" },
      NOW,
    );

    expect(view.can_answer).toBe(false);
    expect(view.hunt.cancelled).toBe(true);
    expect(view.refusal).toMatchObject({ code: "hunt_cancelled" });
  });
});

describe("invitationMessages", () => {
  const body = "Battue le {date}.{#plusieurs} OUI {jour}{/plusieurs} {lien}";

  it("renders the SMS in GSM-7 and the e-mail with accents", () => {
    const messages = invitationMessages({
      body,
      hunt: hunt({ date: "2027-08-14" }),
      link: "https://diane.example.org/r/abc",
      several: false,
    });

    expect(messages).toStrictEqual({
      sms: "Battue le samedi 14 aout. https://diane.example.org/r/abc",
      email: {
        subject: "Battue du samedi 14 août",
        text: "Battue le samedi 14 août. https://diane.example.org/r/abc",
      },
    });
  });

  it("adds the day line with several open invitations", () => {
    expect(
      invitationMessages({ body, hunt: hunt(), link: "L", several: true }).sms,
    ).toBe("Battue le samedi 14 novembre. OUI 14 L");
  });
});

describe("channelsToResend", () => {
  // Booted at 09:00, now 10:00.
  const context = {
    huntSent: true,
    bootedAt: new Date("2026-11-08T09:00:00.000Z"),
    now: NOW,
  };
  const invitation = (
    sms_status: string,
    email_status: string,
    updated = "2026-11-08 09:59:00.000Z",
  ) => ({ sms_status, email_status, updated });

  it("resends failed channels only", () => {
    expect(
      channelsToResend(invitation("failed", "sent"), context),
    ).toStrictEqual({ sms: true, email: false });
    expect(
      channelsToResend(invitation("skipped", "failed"), context),
    ).toStrictEqual({ sms: false, email: true });
  });

  it("leaves a sending in progress alone", () => {
    expect(
      channelsToResend(invitation("sending", "sending"), context),
    ).toStrictEqual({ sms: false, email: false });
  });

  it(`takes over a sending older than ${STALE_SENDING_MS / 60000} minutes`, () => {
    const at = (ms: number) =>
      new Date(NOW.getTime() - ms).toISOString().replace("T", " ");

    expect(
      channelsToResend(
        invitation("sending", "sent", at(STALE_SENDING_MS)),
        context,
      ),
    ).toStrictEqual({ sms: true, email: false });
    expect(
      channelsToResend(
        invitation("sending", "sent", at(STALE_SENDING_MS - 1000)),
        context,
      ),
    ).toStrictEqual({ sms: false, email: false });
  });

  it("takes over a sending interrupted by a restart", () => {
    expect(
      channelsToResend(
        invitation("sending", "sending", "2026-11-08 08:59:59.000Z"),
        context,
      ),
    ).toStrictEqual({ sms: true, email: true });
  });

  it("sends channels never sent of a hunt already sent", () => {
    expect(channelsToResend(invitation("", "sent"), context)).toStrictEqual({
      sms: true,
      email: false,
    });
    expect(
      channelsToResend(invitation("", ""), { ...context, huntSent: false }),
    ).toStrictEqual({ sms: false, email: false });
  });
});

describe("sendSummary", () => {
  it("counts each channel's statuses", () => {
    expect(
      sendSummary([
        { sms_status: "sent", email_status: "skipped" },
        { sms_status: "failed", email_status: "sent" },
        { sms_status: "sent", email_status: "sent" },
      ]),
    ).toStrictEqual({
      invited: 3,
      sms: { sent: 2, failed: 1, skipped: 0 },
      email: { sent: 2, failed: 0, skipped: 1 },
    });
  });
});
