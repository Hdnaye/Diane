// POST /api/diane/hunts/{id}/cancel (organizer): cancels a hunt and tells
// every invited member who did not answer no, by SMS and e-mail. Later
// answers (web or SMS) are refused.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { huntDays, phoneNumbers, recordsPath, uniqueEmail } from "./api.js";
import { startTestInstance, type TestInstance } from "./instance.js";
import { postWebhook, receivedEvent } from "./sms-webhook-client.js";

const nextPhone = phoneNumbers(51);
const nextDay = huntDays(2121);
const DEADLINE = "2120-12-01 17:00:00.000Z";
const SECRET = randomBytes(24).toString("hex");

type ApiRecord = Record<string, string> & {
  id: string;
  phone: string;
  email: string;
  token: string;
  date: string;
};

describe("cancel a hunt", () => {
  let pb: TestInstance;

  beforeAll(async () => {
    pb = await startTestInstance({
      env: { DIANE_SMS_WEBHOOK_SECRET: SECRET },
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
      name: "Jeanne Martin",
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

  const invite = async (hunt: ApiRecord, participation = "pending") => {
    const member = await newMember();
    const invitation = await create("invitations", {
      hunt: hunt.id,
      member: member.id,
      participation,
    });
    return { member, invitation };
  };

  const cancel = (huntId: string, token = pb.organizerToken) =>
    pb.api(`/api/diane/hunts/${huntId}/cancel`, { method: "POST", token });

  const record = async (collection: string, id: string) =>
    (await pb.api(recordsPath(collection, id), { token: pb.organizerToken }))
      .body as ApiRecord;

  const messagesTo = async (member: ApiRecord) =>
    (await pb.outbox()).filter(
      (message) => message.to === member.phone || message.to === member.email,
    );

  it("refuses anonymous requests", async () => {
    const hunt = await newHunt();

    expect((await cancel(hunt.id, "")).status).toBe(401);
    expect((await record("hunts", hunt.id)).status).toBe("invitations_sent");
  });

  it("answers 404 for an unknown hunt", async () => {
    expect((await cancel("unknownhunt0000")).status).toBe(404);
  });

  it("cancels and tells every member who did not answer no", async () => {
    const hunt = await newHunt();
    const pending = await invite(hunt);
    const present = await invite(hunt, "present");
    const waiting = await invite(hunt, "waiting_list");
    const absent = await invite(hunt, "absent");

    const response = await cancel(hunt.id);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      notified: 3,
      sms: { sent: 3, failed: 0, skipped: 0, not_sent: 0 },
      email: { sent: 3, failed: 0, skipped: 0, not_sent: 0 },
    });
    const cancelled = await record("hunts", hunt.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelled_at).not.toBe("");
    for (const { member, invitation } of [pending, present, waiting]) {
      const messages = await messagesTo(member);
      expect(messages).toHaveLength(2);
      const sms = messages.find((message) => message.kind === "sms");
      expect(sms?.id).toBe(`can-${invitation.id}`);
      expect(sms?.text).toMatch(
        /^La battue du \w+ \d+(er)? \w+ à 8h00 est annulée\.$/,
      );
      const email = messages.find((message) => message.kind === "email");
      expect(email?.subject).toMatch(/^Battue du .+ annulée$/);
      expect(await record("invitations", invitation.id)).toMatchObject({
        cancellation_sms_status: "sent",
        cancellation_email_status: "sent",
      });
    }
    expect(await messagesTo(absent.member)).toHaveLength(0);
    // The answers are kept as they were.
    expect(
      (await record("invitations", present.invitation.id)).participation,
    ).toBe("present");
  });

  it("is idempotent: nobody is told twice", async () => {
    const hunt = await newHunt();
    const { member } = await invite(hunt);
    await cancel(hunt.id);

    const again = await cancel(hunt.id);

    expect(again.status).toBe(200);
    expect(again.body).toStrictEqual({
      notified: 0,
      sms: { sent: 0, failed: 0, skipped: 0, not_sent: 0 },
      email: { sent: 0, failed: 0, skipped: 0, not_sent: 0 },
    });
    expect(await messagesTo(member)).toHaveLength(2);
  });

  it("tells again the notices that failed", async () => {
    const hunt = await newHunt();
    const { member, invitation } = await invite(hunt);
    await cancel(hunt.id);
    await pb.api(recordsPath("invitations", invitation.id), {
      method: "PATCH",
      token: pb.organizerToken,
      body: { cancellation_sms_status: "failed" },
    });

    const again = await cancel(hunt.id);

    expect(again.body).toMatchObject({
      notified: 1,
      sms: { sent: 1 },
      email: { sent: 0 },
    });
    expect(
      (await messagesTo(member)).filter((message) => message.kind === "sms"),
    ).toHaveLength(2);
  });

  it("skips the channel a member has no address for", async () => {
    const hunt = await newHunt();
    const member = await newMember({ email: "" });
    await create("invitations", { hunt: hunt.id, member: member.id });

    const response = await cancel(hunt.id);

    expect(response.body.email).toStrictEqual({
      sent: 0,
      failed: 0,
      skipped: 1,
      not_sent: 0,
    });
  });

  it("cancels a draft without telling anybody", async () => {
    const hunt = await newHunt({ status: "draft" });

    const response = await cancel(hunt.id);

    expect(response.body.notified).toBe(0);
    expect((await record("hunts", hunt.id)).status).toBe("cancelled");
  });

  it("refuses later web answers with a clear message", async () => {
    const hunt = await newHunt();
    const { invitation } = await invite(hunt);
    await cancel(hunt.id);

    const response = await pb.api(`/api/diane/r/${invitation.token}`, {
      method: "POST",
      body: { answer: "yes" },
    });

    expect(response.status).toBe(409);
    expect(response.body.data.answer).toMatchObject({
      code: "hunt_cancelled",
      message: "La battue est annulée.",
    });
  });

  it("answers a later SMS reply that the hunt is cancelled", async () => {
    const hunt = await newHunt();
    const { member, invitation } = await invite(hunt);
    await cancel(hunt.id);

    const response = await postWebhook(
      pb.process.url,
      receivedEvent(member.phone, "OUI"),
      { secret: SECRET },
    );

    expect(response.body).toStrictEqual({ status: "cancelled" });
    expect((await record("invitations", invitation.id)).participation).toBe(
      "pending",
    );
    const sms = (await messagesTo(member)).filter(
      (message) => message.kind === "sms",
    );
    expect(sms.at(-1)?.text).toMatch(/^La battue du .+ est annulée\.$/);
  });

  it("refuses to send invitations afterwards", async () => {
    const hunt = await newHunt();
    await cancel(hunt.id);

    const response = await pb.api(
      `/api/diane/hunts/${hunt.id}/send-invitations`,
      { method: "POST", token: pb.organizerToken },
    );

    expect(response.status).toBe(409);
    expect(response.body.data.hunt.code).toBe("hunt_cancelled");
  });
});
