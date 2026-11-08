import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  SIGNATURE_MAX_AGE_S,
  MAX_CONFIRMATIONS_PER_HOUR,
  timestampFresh,
  parseWebhookEvent,
  isOwnNumber,
  resolveSmsReply,
} =
  require("../../pb_hooks/lib/sms-inbound.cjs") as typeof import("../../pb_hooks/lib/sms-inbound.cjs");

// Sunday 2026-11-08 11:00 Paris.
const NOW = new Date("2026-11-08T10:00:00.000Z");
const NOW_S = NOW.getTime() / 1000;

describe("timestampFresh", () => {
  it(`accepts a timestamp within ${SIGNATURE_MAX_AGE_S} s`, () => {
    expect(SIGNATURE_MAX_AGE_S).toBe(300);
    expect(timestampFresh(String(NOW_S), NOW)).toBe(true);
    expect(timestampFresh(String(NOW_S - 300), NOW)).toBe(true);
    expect(timestampFresh(String(NOW_S + 300), NOW)).toBe(true);
  });

  it.each([
    String(NOW_S - 301),
    String(NOW_S + 301),
    "",
    "abc",
    `${NOW_S}.5`,
    `-${NOW_S}`,
    "1".repeat(20),
  ])("refuses %j", (timestamp) => {
    expect(timestampFresh(timestamp, NOW)).toBe(false);
  });
});

describe("parseWebhookEvent", () => {
  const received = {
    deviceId: "ffffffffceb0b1db0000018e937c815b",
    event: "sms:received",
    id: "Ey6ECgOkVVFjz3CL48B8C",
    payload: {
      messageId: "abc123",
      message: "OUI 14",
      sender: "+33639985001",
      recipient: "+33639985099",
      simNumber: 1,
      receivedAt: "2026-11-08T11:00:00.000+01:00",
    },
    webhookId: "LreFUt-Z3sSq0JufY9uWB",
  };

  it("reads an sms:received event (SMS Gateway for Android)", () => {
    expect(parseWebhookEvent(JSON.stringify(received))).toStrictEqual({
      event: "sms:received",
      eventId: "Ey6ECgOkVVFjz3CL48B8C",
      sender: "+33639985001",
      recipient: "+33639985099",
      text: "OUI 14",
    });
  });

  it("accepts the older phoneNumber field and a missing recipient", () => {
    const body = {
      event: "sms:received",
      id: "evt1",
      payload: { message: "non", phoneNumber: "0639985001", recipient: null },
    };
    expect(parseWebhookEvent(JSON.stringify(body))).toStrictEqual({
      event: "sms:received",
      eventId: "evt1",
      sender: "0639985001",
      recipient: "",
      text: "non",
    });
  });

  it("reads other events without payload checks", () => {
    expect(
      parseWebhookEvent(JSON.stringify({ event: "sms:sent", id: "x" })),
    ).toStrictEqual({
      event: "sms:sent",
      eventId: "x",
      sender: "",
      recipient: "",
      text: "",
    });
  });

  it("drops an unusable event id", () => {
    const body = { ...received, id: "a b".repeat(40) };
    expect(parseWebhookEvent(JSON.stringify(body))?.eventId).toBe("");
  });

  it.each([
    "",
    "not json",
    "[]",
    "null",
    JSON.stringify({ id: "x" }),
    JSON.stringify({ event: "sms:received", id: "x" }),
    JSON.stringify({ event: "sms:received", payload: { message: "oui" } }),
    JSON.stringify({
      event: "sms:received",
      payload: { message: 3, sender: "+33639985001" },
    }),
  ])("refuses a malformed body: %s", (raw) => {
    expect(parseWebhookEvent(raw)).toBeNull();
  });
});

describe("isOwnNumber", () => {
  it("recognizes the gateway's own numbers, normalized", () => {
    expect(isOwnNumber("+33639985099", ["06 39 98 50 99"])).toBe(true);
    expect(isOwnNumber("0639985099", ["", "+33639985099"])).toBe(true);
  });

  it("ignores empty or other numbers", () => {
    expect(isOwnNumber("+33639985001", ["+33639985099", ""])).toBe(false);
    expect(isOwnNumber("", [""])).toBe(false);
    expect(isOwnNumber("SFR", ["SFR"])).toBe(false);
  });
});

describe("MAX_CONFIRMATIONS_PER_HOUR", () => {
  it("caps confirmations sent to a member (no loop)", () => {
    expect(MAX_CONFIRMATIONS_PER_HOUR).toBe(5);
  });
});

describe("resolveSmsReply", () => {
  const hunt = (fields: Record<string, string> = {}) => ({
    date: "2026-11-14",
    meeting_time: "08:00",
    response_deadline: "2026-11-12 19:00:00.000Z",
    status: "invitations_sent",
    ...fields,
  });
  const invitation = (
    id: string,
    { participation = "pending", ...fields }: Record<string, string> = {},
  ) => ({
    id,
    participation,
    hunt: hunt(fields),
  });

  describe("without a day", () => {
    it("applies to the single open invitation", () => {
      expect(
        resolveSmsReply({ answer: "yes" }, [invitation("a")], NOW),
      ).toStrictEqual({ action: "apply", invitationId: "a", answer: "yes" });
    });

    it("ignores hunts that are past, closed to answers, or drafts", () => {
      expect(
        resolveSmsReply(
          { answer: "no" },
          [
            invitation("past", { date: "2026-11-01", response_deadline: "" }),
            invitation("late", {
              date: "2026-11-09",
              response_deadline: "2026-11-08 09:00:00.000Z",
              participation: "absent",
            }),
            invitation("draft", { date: "2026-11-21", status: "draft" }),
            invitation("b", { date: "2026-11-15" }),
          ],
          NOW,
        ),
      ).toStrictEqual({ action: "apply", invitationId: "b", answer: "no" });
    });

    it("sends it to review when another upcoming hunt still waits for an answer", () => {
      // A late "OUI" for tomorrow's hunt (deadline passed) must not be
      // applied to next week's: in doubt, to check.
      expect(
        resolveSmsReply(
          { answer: "yes" },
          [
            invitation("late", {
              date: "2026-11-09",
              response_deadline: "2026-11-08 09:00:00.000Z",
            }),
            invitation("b", { date: "2026-11-15" }),
          ],
          NOW,
        ),
      ).toStrictEqual({ action: "review", reason: "ambiguous" });
    });

    it("sends several open invitations to review", () => {
      expect(
        resolveSmsReply(
          { answer: "yes" },
          [invitation("a"), invitation("b", { date: "2026-11-15" })],
          NOW,
        ),
      ).toStrictEqual({
        action: "review",
        reason: "several_open_invitations",
      });
    });

    it("sends a reply without open invitation to review", () => {
      expect(resolveSmsReply({ answer: "yes" }, [], NOW)).toStrictEqual({
        action: "review",
        reason: "no_open_invitation",
      });
    });

    it("sends a reply after the deadline to review", () => {
      expect(
        resolveSmsReply(
          { answer: "yes" },
          [invitation("a", { response_deadline: "2026-11-08 09:00:00.000Z" })],
          NOW,
        ),
      ).toStrictEqual({ action: "review", reason: "deadline_passed" });
    });

    it("tells about the single cancelled hunt", () => {
      expect(
        resolveSmsReply(
          { answer: "yes" },
          [invitation("a", { status: "cancelled" })],
          NOW,
        ),
      ).toStrictEqual({ action: "cancelled", invitationId: "a" });
    });

    it("prefers the open invitation over a cancelled one", () => {
      expect(
        resolveSmsReply(
          { answer: "yes" },
          [
            invitation("a", { status: "cancelled" }),
            invitation("b", { date: "2026-11-15" }),
          ],
          NOW,
        ),
      ).toStrictEqual({ action: "apply", invitationId: "b", answer: "yes" });
    });
  });

  describe("with a day", () => {
    const several = [
      invitation("a"),
      invitation("b", { date: "2026-11-15" }),
      invitation("c", { date: "2026-11-21", status: "cancelled" }),
      invitation("d", {
        date: "2026-11-09",
        response_deadline: "2026-11-08 09:00:00.000Z",
      }),
    ];

    it("applies to the open invitation of that day", () => {
      expect(
        resolveSmsReply({ answer: "no", day: 15 }, several, NOW),
      ).toStrictEqual({ action: "apply", invitationId: "b", answer: "no" });
    });

    it("tells about a cancelled hunt that day", () => {
      expect(
        resolveSmsReply({ answer: "yes", day: 21 }, several, NOW),
      ).toStrictEqual({ action: "cancelled", invitationId: "c" });
    });

    it("sends a day past its deadline to review", () => {
      expect(
        resolveSmsReply({ answer: "yes", day: 9 }, several, NOW),
      ).toStrictEqual({ action: "review", reason: "deadline_passed" });
    });

    it("sends an unknown day to review", () => {
      expect(
        resolveSmsReply({ answer: "yes", day: 16 }, several, NOW),
      ).toStrictEqual({ action: "review", reason: "unknown_day" });
    });

    it("sends a day matching several hunts (months apart) to review", () => {
      expect(
        resolveSmsReply(
          { answer: "yes", day: 14 },
          [invitation("a"), invitation("b", { date: "2026-12-14" })],
          NOW,
        ),
      ).toStrictEqual({ action: "review", reason: "ambiguous_day" });
    });

    it("ignores past hunts and drafts of that day", () => {
      expect(
        resolveSmsReply(
          { answer: "yes", day: 1 },
          [
            invitation("past", { date: "2026-11-01", response_deadline: "" }),
            invitation("draft", { date: "2026-12-01", status: "draft" }),
          ],
          NOW,
        ),
      ).toStrictEqual({ action: "review", reason: "unknown_day" });
    });

    it("sends a closed hunt to review", () => {
      expect(
        resolveSmsReply(
          { answer: "yes", day: 14 },
          [invitation("a", { status: "closed" })],
          NOW,
        ),
      ).toStrictEqual({ action: "review", reason: "hunt_closed" });
    });
  });
});
