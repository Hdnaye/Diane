// Reminder cron (dianeReminders): 24 hours before the response deadline,
// members who have not answered get a short SMS / e-mail, once. Triggered
// through PocketBase's cron API (superuser), which runs the job in the
// background: tests wait for its effects.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { phoneNumbers, recordsPath, uniqueEmail } from "./api.js";
import { startFakeGateway } from "./fake-servers.js";
import {
  startTestInstance,
  TEST_PUBLIC_URL,
  type TestInstance,
} from "./instance.js";

const nextPhone = phoneNumbers(52);
const HOUR = 60 * 60 * 1000;
/** A cron schedule that never fires (February 31st). */
const NEVER = "0 0 31 2 *";

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
        `^Rappel : battue du .+ à 8h00\\. Vous n'avez pas encore répondu\\. Répondez par SMS OUI ${day} ou NON ${day} avant le .+\\.$`,
      ),
    );
    const email = messages.find((message) => message.kind === "email");
    expect(email?.subject).toMatch(/^Rappel : battue du /);
    expect(email?.text).toContain(
      `${TEST_PUBLIC_URL}/r/${pending.invitation.token}`,
    );
    expect(sms?.id).toBe(`rem-${pending.invitation.id}`);
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

describe("automatic retries against a real (fake) gateway", () => {
  let pb: TestInstance;
  let gateway: Awaited<ReturnType<typeof startFakeGateway>>;

  beforeAll(async () => {
    gateway = await startFakeGateway();
    pb = await startTestInstance({
      env: {
        DIANE_SMS_TRANSPORT: "",
        DIANE_SMS_GATEWAY_URL: gateway.url,
        DIANE_SMS_GATEWAY_USERNAME: "sms",
        DIANE_SMS_GATEWAY_PASSWORD: randomBytes(16).toString("hex"),
        // Runs triggered by the tests only: a scheduled run in the middle
        // of a test (every 10 minutes of the clock) would retry too early.
        DIANE_REMINDER_SCHEDULE: NEVER,
      },
    });
  });

  afterAll(async () => {
    await pb?.stop();
    await gateway?.stop();
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

  it("takes its schedule from DIANE_REMINDER_SCHEDULE", async () => {
    const response = await pb.api("/api/crons", { token: pb.superuserToken });

    expect(response.body).toContainEqual({
      id: "dianeReminders",
      expression: NEVER,
    });
  });

  /** A hunt due for its reminder with `count` pending members (no e-mail). */
  async function dueHunt(count: number) {
    const hunt = await create("hunts", {
      date: nextDay(),
      meeting_time: "08:00",
      response_deadline: fromNow(23 * HOUR),
      status: "invitations_sent",
      invitations_sent_at: fromNow(-48 * HOUR),
    });
    const invitations: ApiRecord[] = [];
    const members: ApiRecord[] = [];
    for (let i = 0; i < count; i++) {
      const member = await create("members", {
        name: "Marie Roux",
        phone: nextPhone(),
      });
      members.push(member);
      invitations.push(
        await create("invitations", { hunt: hunt.id, member: member.id }),
      );
    }
    return { hunt, members, invitations };
  }

  const smsTo = (member: ApiRecord) =>
    gateway.requests.filter((request) =>
      JSON.stringify(request.body).includes(member.phone),
    ).length;

  const statuses = async (invitations: ApiRecord[]) =>
    Promise.all(
      invitations.map(async (invitation) => {
        const body = (
          await pb.api(recordsPath("invitations", invitation.id), {
            token: pb.organizerToken,
          })
        ).body;
        return {
          status: body.reminder_sms_status as string,
          attempts: body.reminder_sms_attempts as number,
        };
      }),
    );

  /** Runs the reminder cron and waits until no reminder is `sending`. */
  async function runAndSettle(invitations: ApiRecord[]) {
    const response = await pb.api("/api/crons/dianeReminders", {
      method: "POST",
      token: pb.superuserToken,
    });
    expect(response.status).toBe(204);
    await sleep(300);
    for (let i = 0; i < 200; i++) {
      const current = await statuses(invitations);
      // Every reminder handled (the run may start late).
      if (
        current.every((item) => item.status !== "sending" && item.status !== "")
      ) {
        return current;
      }
      await sleep(100);
    }
    throw new Error("Reminders still sending");
  }

  /** SMS really sent to `member` (accepted by the gateway). */
  const acceptedTo = (member: ApiRecord) =>
    gateway.accepted.filter((request) =>
      JSON.stringify(request.body).includes(member.phone),
    ).length;

  it("resends a reminder that timed out without duplicate (same id rejected), and reaches everybody", async () => {
    const { members, invitations } = await dueHunt(2);
    // The phone takes each SMS, but answers after the 5 s timeout.
    gateway.delayAnswers(6000);
    try {
      await runAndSettle(invitations);
    } finally {
      gateway.delayAnswers(0);
    }
    // Both timed out in the same run: the phone answers the quick check,
    // so the run goes on (slow phone, not switched off).
    expect(await statuses(invitations)).toStrictEqual(
      Array(2).fill({ status: "failed", attempts: 1 }),
    );
    expect(members.map(acceptedTo)).toStrictEqual([1, 1]);

    await runAndSettle(invitations);

    // Retried with the same id: the gateway rejects the duplicate (409),
    // recorded as sent. Each member got one SMS.
    expect(members.map(acceptedTo)).toStrictEqual([1, 1]);
    expect(await statuses(invitations)).toStrictEqual(
      Array(2).fill({ status: "sent", attempts: 2 }),
    );
    expect(
      gateway.requests
        .filter((request) =>
          JSON.stringify(request.body).includes(members[0]?.phone ?? "?"),
        )
        .map((request) => (request.body as { id: string }).id),
    ).toStrictEqual([`rem-${invitations[0]?.id}`, `rem-${invitations[0]?.id}`]);
  }, 90_000);

  it("sends the reminders once the unreachable gateway is back", async () => {
    const { members, invitations } = await dueHunt(3);
    gateway.setDown(true);
    try {
      await runAndSettle(invitations);
    } finally {
      gateway.setDown(false);
    }
    const before = await statuses(invitations);
    // One attempt failed, the others not attempted: not sent, retried.
    expect(before.filter((item) => item.status === "failed")).toStrictEqual([
      { status: "failed", attempts: 1 },
    ]);
    expect(before.filter((item) => item.status === "not_sent")).toStrictEqual(
      Array(2).fill({ status: "not_sent", attempts: 0 }),
    );

    await runAndSettle(invitations);

    expect(members.map(acceptedTo)).toStrictEqual([1, 1, 1]);
    expect(
      (await statuses(invitations)).map((item) => item.status),
    ).toStrictEqual(["sent", "sent", "sent"]);
  }, 60_000);

  it("retries a failed reminder at most 3 times", async () => {
    const { members, invitations } = await dueHunt(2);
    gateway.answerWith(503);
    try {
      for (let run = 0; run < 5; run++) await runAndSettle(invitations);
    } finally {
      gateway.answerWith(202);
    }

    expect(members.map(smsTo)).toStrictEqual([3, 3]);
    expect(members.map(acceptedTo)).toStrictEqual([0, 0]);
    expect(await statuses(invitations)).toStrictEqual(
      Array(2).fill({ status: "failed", attempts: 3 }),
    );
  }, 30_000);

  it("caps the cancellation notices the same way", async () => {
    const { hunt, members, invitations } = await dueHunt(1);
    const cancel = () =>
      pb.api(`/api/diane/hunts/${hunt.id}/cancel`, {
        method: "POST",
        token: pb.organizerToken,
      });
    gateway.answerWith(503);
    try {
      for (let call = 0; call < 5; call++) await cancel();
    } finally {
      gateway.answerWith(202);
    }

    expect(smsTo(members[0] as ApiRecord)).toBe(3);
    const body = (
      await pb.api(recordsPath("invitations", invitations[0]?.id ?? ""), {
        token: pb.organizerToken,
      })
    ).body;
    expect(body).toMatchObject({
      cancellation_sms_status: "failed",
      cancellation_sms_attempts: 3,
    });
  });
});
