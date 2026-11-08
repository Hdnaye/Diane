// POST /api/diane/sms/webhook (public, signed): SMS received by the gateway
// phone (SMS Gateway for Android, `sms:received` webhook), applied to the
// member's invitation like a web answer, confirmed by SMS, or queued for
// the organizer ("to check").
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { huntDays, phoneNumbers, recordsPath, uniqueEmail } from "./api.js";
import { startTestInstance, type TestInstance } from "./instance.js";
import {
  GATEWAY_PHONE,
  postWebhook as post,
  receivedEvent,
  sign,
  type WebhookOptions,
} from "./sms-webhook-client.js";

const nextPhone = phoneNumbers(50);
const nextDay = huntDays(2120);
const DEADLINE = "2119-12-01 17:00:00.000Z";
const SECRET = randomBytes(24).toString("hex");

type ApiRecord = Record<string, string> & {
  id: string;
  phone: string;
  date: string;
  participation: string;
};

const postWebhook = (
  url: string,
  body: unknown,
  options: Partial<WebhookOptions> = {},
) => post(url, body, { secret: SECRET, ...options });

describe("incoming SMS webhook", () => {
  let pb: TestInstance;

  beforeAll(async () => {
    pb = await startTestInstance({
      env: {
        DIANE_SMS_WEBHOOK_SECRET: SECRET,
        DIANE_SMS_GATEWAY_PHONE: "06 39 98 50 99",
      },
    });
  });

  afterAll(async () => {
    await pb?.stop();
  });

  async function create(collection: string, body: Record<string, unknown>) {
    const response = await pb.api(recordsPath(collection), {
      method: "POST",
      token: pb.organizerToken,
      body,
    });
    if (response.status !== 200) {
      throw new Error(
        `Setup failed: HTTP ${response.status} ${JSON.stringify(response.body)}`,
      );
    }
    return response.body as ApiRecord;
  }

  const newMember = (fields: Record<string, unknown> = {}) =>
    create("members", {
      name: "Paul Moreau",
      phone: nextPhone(),
      email: uniqueEmail(),
      ...fields,
    });

  const newHunt = (fields: Record<string, unknown> = {}) =>
    create("hunts", {
      date: nextDay(),
      meeting_time: "08:00",
      response_deadline: DEADLINE,
      status: "invitations_sent",
      ...fields,
    });

  const invite = (hunt: ApiRecord, member: ApiRecord, fields = {}) =>
    create("invitations", { hunt: hunt.id, member: member.id, ...fields });

  const record = async (collection: string, id: string) =>
    (await pb.api(recordsPath(collection, id), { token: pb.organizerToken }))
      .body as ApiRecord;

  const receive = (sender: string, message: string, id?: string) =>
    postWebhook(pb.process.url, receivedEvent(sender, message, id));

  /** SMS recorded by the fake transport to `to` (one number per test). */
  const newSms = async (to: string) =>
    (await pb.outbox()).filter(
      (message) => message.kind === "sms" && message.to === to,
    );

  async function queued(fromPhone: string) {
    const response = await pb.api(
      `${recordsPath("sms_review_queue")}?filter=${encodeURIComponent(`from_phone="${fromPhone}"`)}`,
      { token: pb.organizerToken },
    );
    return response.body.items as ApiRecord[];
  }

  /** Day of the month of a hunt, as members type it. */
  const dayOf = (hunt: ApiRecord) => Number(hunt.date.slice(8, 10));

  describe("authentication", () => {
    it("refuses an unsigned request without detail", async () => {
      const member = await newMember();
      const response = await postWebhook(
        pb.process.url,
        receivedEvent(member.phone, "OUI"),
        { signature: null },
      );

      expect(response.status).toBe(401);
      expect(JSON.stringify(response.body)).not.toMatch(
        /signature|timestamp|secret/i,
      );
      expect(await queued(member.phone)).toHaveLength(0);
    });

    it("refuses a wrong signature", async () => {
      const member = await newMember();
      const response = await postWebhook(
        pb.process.url,
        receivedEvent(member.phone, "blabla"),
        { secret: "not-the-secret" },
      );

      expect(response.status).toBe(401);
      expect(await queued(member.phone)).toHaveLength(0);
    });

    it("refuses a signature of another body", async () => {
      const member = await newMember();
      const event = receivedEvent(member.phone, "blabla");
      const timestamp = String(Math.floor(Date.now() / 1000));
      const response = await postWebhook(pb.process.url, event, {
        timestamp,
        signature: sign(
          JSON.stringify({ ...event, id: "other" }),
          timestamp,
          SECRET,
        ),
      });

      expect(response.status).toBe(401);
    });

    it("refuses an old timestamp (replay)", async () => {
      const member = await newMember();
      const response = await postWebhook(
        pb.process.url,
        receivedEvent(member.phone, "blabla"),
        { timestamp: String(Math.floor(Date.now() / 1000) - 600) },
      );

      expect(response.status).toBe(401);
      expect(await queued(member.phone)).toHaveLength(0);
    });

    it("refuses a malformed body once authenticated", async () => {
      expect((await postWebhook(pb.process.url, "{oops")).status).toBe(400);
    });

    it("ignores other events", async () => {
      const response = await postWebhook(pb.process.url, {
        event: "sms:sent",
        id: "evt-sent-1",
        payload: {},
      });

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({ status: "ignored" });
    });
  });

  describe("recognized replies", () => {
    it("applies a yes to the single open invitation and confirms it", async () => {
      const member = await newMember();
      const hunt = await newHunt();
      const invitation = await invite(hunt, member);

      const response = await receive(member.phone, "Oui merci 👍");

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({ status: "applied" });
      expect(await record("invitations", invitation.id)).toMatchObject({
        participation: "present",
        answered_via: "sms",
      });
      const sms = await newSms(member.phone);
      expect(sms).toHaveLength(1);
      expect(sms[0]?.text).toMatch(
        /^Présence OUI enregistrée pour la battue du \w+ \d+(er)? \w+\. Modifiable jusqu'au /,
      );
    });

    it("applies a no and confirms the absence", async () => {
      const member = await newMember();
      const invitation = await invite(await newHunt(), member, {
        participation: "present",
      });

      await receive(member.phone, "non");

      expect((await record("invitations", invitation.id)).participation).toBe(
        "absent",
      );
      expect((await newSms(member.phone))[0]?.text).toMatch(
        /^Absence enregistrée pour la battue du /,
      );
    });

    it("puts a yes on the waiting list when the hunt is full", async () => {
      const hunt = await newHunt({ max_participants: 1 });
      await invite(hunt, await newMember(), { participation: "present" });
      const member = await newMember();
      const invitation = await invite(hunt, member);

      await receive(member.phone, "OUI");

      expect((await record("invitations", invitation.id)).participation).toBe(
        "waiting_list",
      );
      expect((await newSms(member.phone))[0]?.text).toMatch(
        /^Vous etes sur liste d'attente pour la battue du /,
      );
    });

    it("applies a reply with a day to the hunt of that day", async () => {
      const member = await newMember();
      const first = await newHunt();
      const second = await newHunt();
      const a = await invite(first, member);
      const b = await invite(second, member);

      await receive(member.phone, `oui le ${dayOf(second)}`);

      expect((await record("invitations", a.id)).participation).toBe("pending");
      expect((await record("invitations", b.id)).participation).toBe("present");
    });

    it("accepts a national number from older gateways (phoneNumber)", async () => {
      const member = await newMember();
      const invitation = await invite(await newHunt(), member);
      const event = receivedEvent("", "NON");
      const payload: Record<string, unknown> = { ...event.payload };
      delete payload.sender;
      const national = `0${member.phone.slice(3)}`;

      const response = await postWebhook(pb.process.url, {
        ...event,
        payload: { ...payload, phoneNumber: national },
      });

      expect(response.body).toStrictEqual({ status: "applied" });
      expect((await record("invitations", invitation.id)).participation).toBe(
        "absent",
      );
    });

    it("handles a webhook sent again once (same event id)", async () => {
      const member = await newMember();
      const invitation = await invite(await newHunt(), member);
      const id = randomBytes(10).toString("hex");

      const first = await receive(member.phone, "OUI", id);
      const again = await receive(member.phone, "OUI", id);

      expect(first.body).toStrictEqual({ status: "applied" });
      expect(again.status).toBe(200);
      expect(again.body).toStrictEqual({ status: "duplicate" });
      expect((await record("invitations", invitation.id)).participation).toBe(
        "present",
      );
      expect(await newSms(member.phone)).toHaveLength(1);
    });

    it("tells that the hunt is cancelled, answer unchanged", async () => {
      const member = await newMember();
      const hunt = await newHunt({ status: "cancelled" });
      const invitation = await invite(hunt, member);

      const response = await receive(member.phone, `OUI ${dayOf(hunt)}`);

      expect(response.body).toStrictEqual({ status: "cancelled" });
      expect((await record("invitations", invitation.id)).participation).toBe(
        "pending",
      );
      expect((await newSms(member.phone))[0]?.text).toMatch(
        /^La battue du \w+ \d+(er)? \w+ est annulée\.$/,
      );
    });

    it("caps the confirmations sent to a member (no loop)", async () => {
      const member = await newMember();
      await invite(await newHunt(), member);

      for (let i = 0; i < 7; i++) {
        expect(
          (await receive(member.phone, i % 2 ? "OUI" : "NON")).body,
        ).toStrictEqual({ status: "applied" });
      }

      expect(await newSms(member.phone)).toHaveLength(5);
    });
  });

  describe("to check", () => {
    it("queues an unknown number, no answer sent", async () => {
      const stranger = nextPhone();

      const response = await receive(stranger, "OUI");

      expect(response.body).toStrictEqual({ status: "review" });
      expect(await queued(stranger)).toMatchObject([
        { body: "OUI", member: "", reason: "unknown_sender", resolved: false },
      ]);
      expect(await newSms(stranger)).toHaveLength(0);
    });

    it("queues an unrecognized message with its member, no answer sent", async () => {
      const member = await newMember();
      const invitation = await invite(await newHunt(), member);

      await receive(member.phone, "oui mais pas le 15");

      expect(await queued(member.phone)).toMatchObject([
        {
          body: "oui mais pas le 15",
          member: member.id,
          reason: "unrecognized",
        },
      ]);
      expect((await record("invitations", invitation.id)).participation).toBe(
        "pending",
      );
      expect(await newSms(member.phone)).toHaveLength(0);
    });

    it("queues a reply without day when several hunts are open", async () => {
      const member = await newMember();
      await invite(await newHunt(), member);
      await invite(await newHunt(), member);

      await receive(member.phone, "OUI");

      expect(await queued(member.phone)).toMatchObject([
        { member: member.id, reason: "several_open_invitations" },
      ]);
      expect(await newSms(member.phone)).toHaveLength(0);
    });

    it("queues a reply after the deadline", async () => {
      const member = await newMember();
      const invitation = await invite(
        await newHunt({ response_deadline: "2026-01-01 10:00:00.000Z" }),
        member,
      );

      await receive(member.phone, "NON");

      expect(await queued(member.phone)).toMatchObject([
        { member: member.id, reason: "deadline_passed" },
      ]);
      expect((await record("invitations", invitation.id)).participation).toBe(
        "pending",
      );
    });

    it("queues an inactive member's reply", async () => {
      const member = await newMember({ active: false });
      await invite(await newHunt(), member);

      await receive(member.phone, "OUI");

      expect(await queued(member.phone)).toMatchObject([
        { member: member.id, reason: "inactive_member" },
      ]);
      expect(await newSms(member.phone)).toHaveLength(0);
    });

    it("ignores a message from the gateway's own number", async () => {
      const response = await receive(GATEWAY_PHONE, "OUI");

      expect(response.body).toStrictEqual({ status: "ignored" });
      expect(await queued(GATEWAY_PHONE)).toHaveLength(0);
      expect(await newSms(GATEWAY_PHONE)).toHaveLength(0);
    });

    it("never answers our own confirmation sent back", async () => {
      const member = await newMember();
      await invite(await newHunt(), member);

      await receive(
        member.phone,
        "Présence OUI enregistrée pour la battue du samedi 14 novembre.",
      );

      expect(await queued(member.phone)).toMatchObject([
        { reason: "unrecognized" },
      ]);
      expect(await newSms(member.phone)).toHaveLength(0);
    });
  });

  it("logs no phone number and no message", async () => {
    const member = await newMember();
    await invite(await newHunt(), member);
    const stranger = nextPhone();
    const secretText = `pas sur ${randomBytes(4).toString("hex")}`;

    await receive(member.phone, "OUI");
    await receive(member.phone, secretText);
    await receive(stranger, secretText);
    await postWebhook(pb.process.url, receivedEvent(stranger, secretText), {
      secret: "wrong",
    });

    const logs = await pb.api("/api/logs?perPage=500&sort=-created", {
      token: pb.superuserToken,
    });
    expect(logs.status).toBe(200);
    const everything = JSON.stringify(logs.body) + pb.process.output();
    for (const forbidden of [
      member.phone,
      member.phone.slice(3),
      stranger,
      stranger.slice(3),
      secretText,
      SECRET,
    ]) {
      expect(everything).not.toContain(forbidden);
    }
  });
});

describe("incoming SMS webhook without secret", () => {
  let pb: TestInstance;

  beforeAll(async () => {
    pb = await startTestInstance({ env: { DIANE_SMS_WEBHOOK_SECRET: "" } });
  });

  afterAll(async () => {
    await pb?.stop();
  });

  it("refuses every request", async () => {
    const response = await postWebhook(
      pb.process.url,
      receivedEvent("+33639985001", "OUI"),
      { secret: "" },
    );

    expect(response.status).toBe(401);
  });
});
