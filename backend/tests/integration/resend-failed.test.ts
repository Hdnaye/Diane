// POST /api/diane/hunts/{id}/resend-failed (organizer): sends again the
// failed SMS / e-mails of a hunt's invitations, e.g. after the gateway phone
// was switched off. Against a fake gateway whose answer can be changed and
// a fake SMTP server enabled or disabled in the settings.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { huntDays, phoneNumbers, recordsPath, uniqueEmail } from "./api.js";
import { startFakeGateway, startFakeSmtp } from "./fake-servers.js";
import {
  startTestInstance,
  TEST_PUBLIC_URL,
  type TestInstance,
} from "./instance.js";

const nextPhone = phoneNumbers(43);
const nextDay = huntDays(2116);
const DEADLINE = "2115-12-01 17:00:00.000Z";

type ApiRecord = Record<string, string> & { id: string };

describe("resend failed invitations", () => {
  let pb: TestInstance;
  let gateway: Awaited<ReturnType<typeof startFakeGateway>>;
  let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;

  beforeAll(async () => {
    gateway = await startFakeGateway();
    smtp = await startFakeSmtp();
    pb = await startTestInstance({
      env: {
        DIANE_SMS_TRANSPORT: "",
        DIANE_EMAIL_TRANSPORT: "",
        DIANE_SMS_GATEWAY_URL: gateway.url,
        DIANE_SMS_GATEWAY_USERNAME: "sms",
        DIANE_SMS_GATEWAY_PASSWORD: randomBytes(16).toString("hex"),
        DIANE_EMAIL_SENDER_ADDRESS: "diane@example.org",
        DIANE_EMAIL_SENDER_NAME: "Diane",
      },
    });
  });

  afterAll(async () => {
    await pb?.stop();
    await gateway?.stop();
    await smtp?.stop();
  });

  async function setSmtp(enabled: boolean) {
    const response = await pb.api("/api/settings", {
      method: "PATCH",
      token: pb.superuserToken,
      body: {
        smtp: { enabled, host: "127.0.0.1", port: smtp.port, tls: false },
      },
    });
    if (response.status !== 200) throw new Error("SMTP settings failed");
  }

  async function create(collection: string, body: Record<string, unknown>) {
    const response = await pb.api(recordsPath(collection), {
      method: "POST",
      token: pb.organizerToken,
      body,
    });
    if (response.status !== 200) {
      throw new Error(`Setup failed: HTTP ${response.status}`);
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

  const newHunt = () =>
    create("hunts", {
      date: nextDay(),
      meeting_time: "08:00",
      response_deadline: DEADLINE,
    });

  const post = (huntId: string, action: string, token = pb.organizerToken) =>
    pb.api(`/api/diane/hunts/${huntId}/${action}`, { method: "POST", token });
  const send = (huntId: string) => post(huntId, "send-invitations");
  const resend = (huntId: string) => post(huntId, "resend-failed");

  async function invitationsOf(huntId: string) {
    const response = await pb.api(
      `${recordsPath("invitations")}?perPage=500&filter=${encodeURIComponent(`hunt="${huntId}"`)}`,
      { token: pb.organizerToken },
    );
    return response.body.items as ApiRecord[];
  }

  async function invitationOf(huntId: string, memberId: string) {
    const all = await invitationsOf(huntId);
    return all.find((item) => item.member === memberId) as ApiRecord;
  }

  /** Sends the invitations of a new hunt with the gateway and SMTP down. */
  async function huntWithFailures() {
    const hunt = await newHunt();
    gateway.answerWith(500);
    await setSmtp(false);
    try {
      const response = await send(hunt.id);
      if (response.status !== 200) throw new Error("Sending failed");
    } finally {
      gateway.answerWith(202);
      await setSmtp(true);
    }
    return hunt;
  }

  /** Gateway requests sent to `phone`. */
  const smsTo = (phone: string) =>
    gateway.requests.filter((request) =>
      JSON.stringify(request.body).includes(phone),
    );
  const mailsTo = (email: string) =>
    smtp.mails.filter((mail) => mail.to.some((to) => to.includes(email)));

  beforeEach(async () => {
    const list = await pb.api(
      `${recordsPath("members")}?perPage=500&filter=${encodeURIComponent("active=true")}`,
      { token: pb.organizerToken },
    );
    for (const member of list.body.items) {
      await pb.api(recordsPath("members", member.id), {
        method: "PATCH",
        token: pb.organizerToken,
        body: { active: false },
      });
    }
    gateway.answerWith(202);
    gateway.delayAnswers(0);
    gateway.onRequest(null);
    await setSmtp(true);
  });

  it("refuses anonymous requests", async () => {
    const hunt = await newHunt();

    expect((await post(hunt.id, "resend-failed", "")).status).toBe(401);
  });

  it("answers 404 for an unknown hunt", async () => {
    expect((await resend("unknownhunt0000")).status).toBe(404);
  });

  it("sends the failed SMS and e-mails again and records the outcome", async () => {
    const both = await newMember();
    const phoneOnly = await newMember({ email: "" });
    const hunt = await huntWithFailures();
    expect(await invitationOf(hunt.id, both.id)).toMatchObject({
      sms_status: "failed",
      email_status: "failed",
    });

    const response = await resend(hunt.id);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      invited: 2,
      sms: { sent: 2, failed: 0, skipped: 0, not_sent: 0 },
      email: { sent: 1, failed: 0, skipped: 0, not_sent: 0 },
    });
    expect(await invitationOf(hunt.id, both.id)).toMatchObject({
      sms_status: "sent",
      email_status: "sent",
    });
    expect(await invitationOf(hunt.id, phoneOnly.id)).toMatchObject({
      sms_status: "sent",
      email_status: "skipped",
    });
    const invitation = await invitationOf(hunt.id, both.id);
    const link = `${TEST_PUBLIC_URL}/r/${invitation.token}`;
    const resent = smsTo(both.phone as string);
    // Once failed (HTTP 500), once sent.
    expect(resent).toHaveLength(2);
    expect(JSON.stringify(resent.at(-1)?.body)).toContain(link);
    expect(mailsTo(both.email as string)).toHaveLength(1);
  });

  it("only resends the failed channel", async () => {
    const member = await newMember();
    const hunt = await newHunt();
    await setSmtp(false);
    await send(hunt.id);
    await setSmtp(true);
    expect(await invitationOf(hunt.id, member.id)).toMatchObject({
      sms_status: "sent",
      email_status: "failed",
    });

    const response = await resend(hunt.id);

    expect(response.body).toStrictEqual({
      invited: 1,
      sms: { sent: 0, failed: 0, skipped: 0, not_sent: 0 },
      email: { sent: 1, failed: 0, skipped: 0, not_sent: 0 },
    });
    expect(smsTo(member.phone as string)).toHaveLength(1);
    expect(mailsTo(member.email as string)).toHaveLength(1);
  });

  it("is idempotent: nothing left to resend the second time", async () => {
    const member = await newMember();
    const hunt = await huntWithFailures();
    await resend(hunt.id);

    const response = await resend(hunt.id);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      invited: 0,
      sms: { sent: 0, failed: 0, skipped: 0, not_sent: 0 },
      email: { sent: 0, failed: 0, skipped: 0, not_sent: 0 },
    });
    expect(smsTo(member.phone as string)).toHaveLength(2);
    expect(mailsTo(member.email as string)).toHaveLength(1);
  });

  it("keeps the failures still failing, to resend later", async () => {
    const member = await newMember();
    const hunt = await huntWithFailures();
    gateway.answerWith(503);

    try {
      const response = await resend(hunt.id);

      expect(response.body).toStrictEqual({
        invited: 1,
        sms: { sent: 0, failed: 1, skipped: 0, not_sent: 0 },
        email: { sent: 1, failed: 0, skipped: 0, not_sent: 0 },
      });
    } finally {
      gateway.answerWith(202);
    }
    expect(await invitationOf(hunt.id, member.id)).toMatchObject({
      sms_status: "failed",
      email_status: "sent",
    });
    expect((await resend(hunt.id)).body.sms.sent).toBe(1);
  });

  it("does not invite new members", async () => {
    await newMember();
    const hunt = await huntWithFailures();
    const newcomer = await newMember();

    const response = await resend(hunt.id);

    expect(response.body.invited).toBe(1);
    expect(await invitationsOf(hunt.id)).toHaveLength(1);
    expect(smsTo(newcomer.phone as string)).toHaveLength(0);
  });

  it("skips members who answered or were deactivated since", async () => {
    const answered = await newMember();
    const deactivated = await newMember();
    const hunt = await huntWithFailures();
    const invitation = await invitationOf(hunt.id, answered.id);
    await pb.api(recordsPath("invitations", invitation.id), {
      method: "PATCH",
      token: pb.organizerToken,
      body: { participation: "absent", answered_via: "manual" },
    });
    await pb.api(recordsPath("members", deactivated.id), {
      method: "PATCH",
      token: pb.organizerToken,
      body: { active: false },
    });

    const response = await resend(hunt.id);

    expect(response.body.invited).toBe(0);
    expect(smsTo(answered.phone as string)).toHaveLength(1);
    expect(smsTo(deactivated.phone as string)).toHaveLength(1);
  });

  it("does not send twice under concurrent requests", async () => {
    const members = [await newMember(), await newMember()];
    const hunt = await huntWithFailures();

    const responses = await Promise.all([resend(hunt.id), resend(hunt.id)]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(
      responses.reduce((sum, response) => sum + response.body.invited, 0),
    ).toBe(2);
    for (const member of members) {
      expect(smsTo(member.phone as string)).toHaveLength(2);
      expect(mailsTo(member.email as string)).toHaveLength(1);
    }
  });

  async function setStatuses(
    huntId: string,
    memberId: string,
    statuses: Record<string, string>,
  ) {
    const invitation = await invitationOf(huntId, memberId);
    const response = await pb.api(recordsPath("invitations", invitation.id), {
      method: "PATCH",
      token: pb.organizerToken,
      body: statuses,
    });
    expect(response.status).toBe(200);
  }

  it("takes over a sending interrupted by a restart", async () => {
    const member = await newMember();
    const hunt = await huntWithFailures();
    // As claimed by a request killed before sending anything.
    await setStatuses(hunt.id, member.id, {
      sms_status: "sending",
      email_status: "sending",
    });

    // A sending in progress (same run, recent) is left alone...
    expect((await resend(hunt.id)).body.invited).toBe(0);

    await pb.restart();
    const response = await resend(hunt.id);

    expect(response.body).toStrictEqual({
      invited: 1,
      sms: { sent: 1, failed: 0, skipped: 0, not_sent: 0 },
      email: { sent: 1, failed: 0, skipped: 0, not_sent: 0 },
    });
    expect(await invitationOf(hunt.id, member.id)).toMatchObject({
      sms_status: "sent",
      email_status: "sent",
    });
    expect(smsTo(member.phone as string)).toHaveLength(2);
    expect(mailsTo(member.email as string)).toHaveLength(1);
  });

  it("sends the channels never sent of a hunt already sent", async () => {
    const member = await newMember();
    const hunt = await huntWithFailures();
    await setStatuses(hunt.id, member.id, { sms_status: "" });

    const response = await resend(hunt.id);

    expect(response.body.sms).toStrictEqual({
      sent: 1,
      failed: 0,
      skipped: 0,
      not_sent: 0,
    });
    expect(await invitationOf(hunt.id, member.id)).toMatchObject({
      sms_status: "sent",
      email_status: "sent",
    });
  });

  it.each([
    [{ status: "cancelled" }, "hunt_cancelled"],
    [{ status: "closed" }, "hunt_closed"],
    [{ response_deadline: "2020-01-01 10:00:00.000Z" }, "deadline_passed"],
  ])("refuses a hunt with %j", async (fields, code) => {
    const member = await newMember();
    const hunt = await huntWithFailures();
    const patched = await pb.api(recordsPath("hunts", hunt.id), {
      method: "PATCH",
      token: pb.organizerToken,
      body: fields,
    });
    expect(patched.status).toBe(200);

    const response = await resend(hunt.id);

    expect(response.status).toBe(409);
    expect(response.body.data.hunt.code).toBe(code);
    expect(smsTo(member.phone as string)).toHaveLength(1);
    expect(await invitationOf(hunt.id, member.id)).toMatchObject({
      sms_status: "failed",
      email_status: "failed",
    });
  });

  describe("long sendings", () => {
    const ms = (value: string) => Date.parse(value.replace(" ", "T"));

    it("refreshes a channel's sending just before sending it", async () => {
      const first = await newMember({ email: "" });
      const second = await newMember({ email: "" });
      const hunt = await newHunt();
      gateway.delayAnswers(1000);
      let seen: ApiRecord | undefined;
      gateway.onRequest(async (request) => {
        if (JSON.stringify(request.body).includes(second.phone as string)) {
          seen = await invitationOf(hunt.id, second.id);
        }
      });

      const response = await send(hunt.id);

      expect(response.body.sms.sent).toBe(2);
      expect(smsTo(first.phone as string)).toHaveLength(1);
      // While its SMS was being sent, the second invitation was `sending`,
      // refreshed after the first SMS (1 s): never stale while in progress.
      expect(seen?.sms_status).toBe("sending");
      expect(
        ms(seen?.updated as string) - ms(seen?.created as string),
      ).toBeGreaterThanOrEqual(900);
    });

    it("does not send a channel taken over meanwhile", async () => {
      const first = await newMember();
      const second = await newMember();
      const hunt = await newHunt();
      gateway.delayAnswers(500);
      gateway.onRequest(async (request) => {
        if (JSON.stringify(request.body).includes(first.phone as string)) {
          // As if resend-failed had taken it over (and failed).
          await setStatuses(hunt.id, second.id, {
            sms_status: "failed",
            email_status: "failed",
          });
        }
      });

      const response = await send(hunt.id);

      expect(response.status).toBe(200);
      expect(smsTo(first.phone as string)).toHaveLength(1);
      expect(smsTo(second.phone as string)).toHaveLength(0);
      expect(mailsTo(second.email as string)).toHaveLength(0);
      expect(await invitationOf(hunt.id, second.id)).toMatchObject({
        sms_status: "failed",
        email_status: "failed",
      });
    });
  });

  it("resends an invitation SMS that timed out without duplicate", async () => {
    const member = await newMember({ email: "" });
    const hunt = await newHunt();
    gateway.delayAnswers(6000);
    try {
      await send(hunt.id);
    } finally {
      gateway.delayAnswers(0);
    }
    const invitation = await invitationOf(hunt.id, member.id);
    expect(invitation.sms_status).toBe("failed");

    const response = await resend(hunt.id);

    expect(response.body.sms).toMatchObject({ sent: 1, failed: 0 });
    expect(
      smsTo(member.phone as string).map(
        (request) => (request.body as { id: string }).id,
      ),
    ).toStrictEqual([`inv-${invitation.id}`, `inv-${invitation.id}`]);
    expect(
      gateway.accepted.filter((request) =>
        JSON.stringify(request.body).includes(member.phone as string),
      ),
    ).toHaveLength(1);
  }, 30_000);
});
