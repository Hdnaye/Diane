// Reminder cron (dianeReminders): 24 hours before the response deadline,
// members who have not answered get a short SMS / e-mail, once. Triggered
// through PocketBase's cron API (superuser), which runs the job in the
// background: tests wait for its effects.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { phoneNumbers, recordsPath, uniqueEmail } from "./api.js";
import {
  startTestInstance,
  TEST_PUBLIC_URL,
  type TestInstance,
} from "./instance.js";

const nextPhone = phoneNumbers(52);
const HOUR = 60 * 60 * 1000;

type ApiRecord = Record<string, string> & {
  id: string;
  phone: string;
  email: string;
  token: string;
  date: string;
};

/** PocketBase datetime `offsetMs` from now. */
const fromNow = (offsetMs: number) =>
  new Date(Date.now() + offsetMs).toISOString().replace("T", " ");

/** Distinct hunt days from 10 days ahead (one hunt per day). */
let dayOffset = 10;
const nextDay = () =>
  new Date(Date.now() + dayOffset++ * 24 * HOUR).toISOString().slice(0, 10);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  for (let i = 0; i < 50; i++) {
    const value = await read();
    if (done(value)) return value;
    await sleep(100);
  }
  return read();
}

describe("reminders", () => {
  let pb: TestInstance;

  beforeAll(async () => {
    pb = await startTestInstance();
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

  /** A hunt whose invitations were sent 2 days ago. */
  const newHunt = (fields: Record<string, unknown> = {}) =>
    create("hunts", {
      date: nextDay(),
      meeting_time: "08:00",
      response_deadline: fromNow(23 * HOUR),
      status: "invitations_sent",
      invitations_sent_at: fromNow(-48 * HOUR),
      ...fields,
    });

  const invite = async (
    hunt: ApiRecord,
    participation = "pending",
    memberFields: Record<string, unknown> = {},
  ) => {
    const member = await create("members", {
      name: "Louis Petit",
      phone: nextPhone(),
      email: uniqueEmail(),
      ...memberFields,
    });
    const invitation = await create("invitations", {
      hunt: hunt.id,
      member: member.id,
      participation,
    });
    return { member, invitation };
  };

  const record = async (collection: string, id: string) =>
    (await pb.api(recordsPath(collection, id), { token: pb.organizerToken }))
      .body as ApiRecord;

  const messagesTo = async (member: ApiRecord) =>
    (await pb.outbox()).filter(
      (message) => message.to === member.phone || message.to === member.email,
    );

  async function runReminders() {
    const response = await pb.api("/api/crons/dianeReminders", {
      method: "POST",
      token: pb.superuserToken,
    });
    expect(response.status).toBe(204);
  }

  /** Runs the cron and waits until `member` got `count` messages. */
  async function remindedTo(member: ApiRecord, count: number) {
    await runReminders();
    return until(
      () => messagesTo(member),
      (messages) => messages.length >= count,
    );
  }

  it("is scheduled every 10 minutes", async () => {
    const response = await pb.api("/api/crons", { token: pb.superuserToken });

    expect(response.body).toContainEqual({
      id: "dianeReminders",
      expression: "*/10 * * * *",
    });
  });

  it("reminds pending members by SMS and e-mail, once", async () => {
    const hunt = await newHunt();
    const pending = await invite(hunt);
    const answered = await invite(hunt, "present");
    const inactive = await invite(hunt, "pending", { active: false });

    const messages = await remindedTo(pending.member, 2);

    const day = Number(hunt.date.slice(8, 10));
    const sms = messages.find((message) => message.kind === "sms");
    expect(sms?.text).toMatch(
      new RegExp(
        `^Rappel : battue du .+ à 8h00\\. Répondez par SMS OUI ${day} ou NON ${day} avant le .+\\.$`,
      ),
    );
    const email = messages.find((message) => message.kind === "email");
    expect(email?.subject).toMatch(/^Rappel : battue du /);
    expect(email?.text).toContain(
      `${TEST_PUBLIC_URL}/r/${pending.invitation.token}`,
    );
    expect(await record("invitations", pending.invitation.id)).toMatchObject({
      reminder_sms_status: "sent",
      reminder_email_status: "sent",
    });
    expect((await record("hunts", hunt.id)).reminder_sent_at).not.toBe("");
    expect(await messagesTo(answered.member)).toHaveLength(0);
    expect(await messagesTo(inactive.member)).toHaveLength(0);

    await runReminders();
    await sleep(1500);

    expect(await messagesTo(pending.member)).toHaveLength(2);
  });

  it("does not remind too early, after the deadline, or for a cancelled hunt", async () => {
    const control = await invite(await newHunt());
    const early = await invite(
      await newHunt({ response_deadline: fromNow(25 * HOUR) }),
    );
    const late = await invite(
      await newHunt({ response_deadline: fromNow(-HOUR) }),
    );
    const cancelled = await invite(await newHunt({ status: "cancelled" }));
    const draft = await invite(await newHunt({ status: "draft" }));
    // Invited 15 hours before the deadline: just got the invitation.
    const recent = await invite(
      await newHunt({
        response_deadline: fromNow(5 * HOUR),
        invitations_sent_at: fromNow(-10 * HOUR),
      }),
    );

    await remindedTo(control.member, 2);
    await sleep(500);

    for (const { member } of [early, late, cancelled, draft, recent]) {
      expect(await messagesTo(member)).toHaveLength(0);
    }
  });

  it("sends again a reminder that failed, until the deadline", async () => {
    const hunt = await newHunt();
    const { member, invitation } = await invite(hunt);
    await remindedTo(member, 2);
    await pb.api(recordsPath("invitations", invitation.id), {
      method: "PATCH",
      token: pb.organizerToken,
      body: { reminder_sms_status: "failed" },
    });

    const messages = await remindedTo(member, 3);

    expect(messages.filter((message) => message.kind === "sms")).toHaveLength(
      2,
    );
    expect(
      (await record("invitations", invitation.id)).reminder_sms_status,
    ).toBe("sent");
  });

  it("does not remind a member who answered meanwhile on a retry", async () => {
    const hunt = await newHunt();
    const { member, invitation } = await invite(hunt);
    await remindedTo(member, 2);
    await pb.api(recordsPath("invitations", invitation.id), {
      method: "PATCH",
      token: pb.organizerToken,
      body: { reminder_sms_status: "failed", participation: "absent" },
    });

    await runReminders();
    await sleep(1500);

    expect(await messagesTo(member)).toHaveLength(2);
  });
});
