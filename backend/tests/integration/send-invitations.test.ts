// POST /api/diane/hunts/{id}/send-invitations, on a dedicated instance:
// every active member of the database is invited, so counts must not
// depend on other test files.
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  huntDays,
  phoneNumbers,
  recordsPath,
  uniqueEmail,
  type ApiResponse,
} from "./api.js";
import {
  startTestInstance,
  TEST_PUBLIC_URL,
  type TestInstance,
} from "./instance.js";

const require = createRequire(import.meta.url);
const { DEFAULT_TEMPLATE_BODY } =
  require("../../pb_hooks/lib/message-template.cjs") as typeof import("../../pb_hooks/lib/message-template.cjs");

const nextPhone = phoneNumbers(40);
const nextDay = huntDays(2110);
const DEADLINE = "2109-12-01 17:00:00.000Z";

describe("send invitations", () => {
  let pb: TestInstance;

  beforeAll(async () => {
    pb = await startTestInstance();
  });

  afterAll(async () => {
    await pb?.stop();
  });

  async function create(
    collection: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, string>> {
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
    return response.body;
  }

  const newHunt = (fields: Record<string, unknown> = {}) =>
    create("hunts", {
      date: nextDay(),
      meeting_time: "08:00",
      response_deadline: DEADLINE,
      ...fields,
    });

  function send(huntId: string, token = pb.organizerToken) {
    return pb.api(`/api/diane/hunts/${huntId}/send-invitations`, {
      method: "POST",
      token,
    });
  }

  async function invitationsOf(huntId: string) {
    const response = await pb.api(
      `${recordsPath("invitations")}?perPage=500&filter=${encodeURIComponent(`hunt="${huntId}"`)}`,
      { token: pb.organizerToken },
    );
    return response.body.items as Record<string, string>[];
  }

  /** Deactivates every member, so that each test chooses who is invited. */
  async function deactivateEveryone() {
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
  }

  beforeEach(async () => {
    await deactivateEveryone();
  });

  it("seeds the default template", async () => {
    const response = await pb.api(
      `${recordsPath("message_templates")}?filter=${encodeURIComponent("is_default=true")}`,
      { token: pb.organizerToken },
    );

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].body).toBe(DEFAULT_TEMPLATE_BODY);
  });

  it("refuses anonymous requests", async () => {
    const hunt = await newHunt();

    const response = await pb.api(
      `/api/diane/hunts/${hunt.id}/send-invitations`,
      { method: "POST" },
    );

    expect(response.status).toBe(401);
    expect(await invitationsOf(hunt.id)).toHaveLength(0);
  });

  it("answers 404 for an unknown hunt", async () => {
    expect((await send("unknownhunt0000")).status).toBe(404);
  });

  it("invites every active member, by SMS and/or e-mail", async () => {
    const phoneOnly = await create("members", {
      name: "Paul Moreau",
      phone: nextPhone(),
    });
    const emailOnly = await create("members", {
      name: "Jean Petit",
      email: uniqueEmail(),
    });
    const both = await create("members", {
      name: "Luc Roux",
      phone: nextPhone(),
      email: uniqueEmail(),
    });
    const inactive = await create("members", {
      name: "Marc Blanc",
      phone: nextPhone(),
      active: false,
    });
    const hunt = await newHunt();
    const before = await pb.outbox();

    const response = await send(hunt.id);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      invited: 3,
      sms: { sent: 2, failed: 0, skipped: 1 },
      email: { sent: 2, failed: 0, skipped: 1 },
    });

    const invitations = await invitationsOf(hunt.id);
    const byMember = Object.fromEntries(
      invitations.map((item) => [item.member, item]),
    );
    expect(Object.keys(byMember).sort()).toStrictEqual(
      [phoneOnly.id, emailOnly.id, both.id].sort(),
    );
    expect(byMember[inactive.id as string]).toBeUndefined();
    expect(byMember[phoneOnly.id as string]).toMatchObject({
      participation: "pending",
      sms_status: "sent",
      email_status: "skipped",
    });
    expect(byMember[emailOnly.id as string]).toMatchObject({
      sms_status: "skipped",
      email_status: "sent",
    });
    expect(byMember[both.id as string]).toMatchObject({
      sms_status: "sent",
      email_status: "sent",
    });

    expect(await pb.outbox()).toHaveLength(before.length + 4);
    const smsTo = (await pb.outbox())
      .filter((message) => message.kind === "sms")
      .map((message) => message.to);
    expect(smsTo).toEqual(
      expect.arrayContaining([phoneOnly.phone, both.phone]),
    );
  });

  it("puts each member's own answer link in the messages", async () => {
    const member = await create("members", {
      name: "Paul Moreau",
      phone: nextPhone(),
      email: uniqueEmail(),
    });
    const hunt = await newHunt();

    await send(hunt.id);

    const [invitation] = await invitationsOf(hunt.id);
    const link = `${TEST_PUBLIC_URL}/r/${invitation?.token}`;
    const messages = (await pb.outbox()).filter(
      (message) => message.to === member.phone || message.to === member.email,
    );
    expect(messages).toHaveLength(2);
    for (const message of messages) expect(message.text).toContain(link);
    const email = messages.find((message) => message.kind === "email");
    expect(email?.subject).toMatch(/^Battue du /);
  });

  it("marks the hunt as sent", async () => {
    const hunt = await newHunt();

    await send(hunt.id);

    const updated = await pb.api(recordsPath("hunts", hunt.id), {
      token: pb.organizerToken,
    });
    expect(updated.body.status).toBe("invitations_sent");
    expect(updated.body.invitations_sent_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });

  it("only invites new members when sent again", async () => {
    const first = await create("members", {
      name: "Paul Moreau",
      phone: nextPhone(),
    });
    const hunt = await newHunt();
    await send(hunt.id);
    const sentAt = (
      await pb.api(recordsPath("hunts", hunt.id), { token: pb.organizerToken })
    ).body.invitations_sent_at;
    const second = await create("members", {
      name: "Jean Petit",
      phone: nextPhone(),
    });
    const before = (await pb.outbox()).length;

    const response = await send(hunt.id);

    expect(response.status).toBe(200);
    expect(response.body.invited).toBe(1);
    const outbox = await pb.outbox();
    expect(outbox).toHaveLength(before + 1);
    expect(outbox.filter((message) => message.to === first.phone)).toHaveLength(
      1,
    );
    expect(
      outbox.filter((message) => message.to === second.phone),
    ).toHaveLength(1);
    expect(await invitationsOf(hunt.id)).toHaveLength(2);
    const hunt2 = await pb.api(recordsPath("hunts", hunt.id), {
      token: pb.organizerToken,
    });
    expect(hunt2.body.invitations_sent_at).toBe(sentAt);
  });

  it("does not invite a member twice under concurrent requests", async () => {
    await create("members", { name: "Paul Moreau", phone: nextPhone() });
    await create("members", { name: "Jean Petit", phone: nextPhone() });
    const hunt = await newHunt();

    const responses = await Promise.all([send(hunt.id), send(hunt.id)]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(
      responses.reduce(
        (sum: number, response: ApiResponse) => sum + response.body.invited,
        0,
      ),
    ).toBe(2);
    expect(await invitationsOf(hunt.id)).toHaveLength(2);
  });

  it.each([
    [{ status: "cancelled" }, "hunt_cancelled"],
    [{ status: "closed" }, "hunt_closed"],
    [{ response_deadline: "2020-01-01 10:00:00.000Z" }, "deadline_passed"],
  ])("refuses a hunt with %j", async (fields, code) => {
    await create("members", { name: "Paul Moreau", phone: nextPhone() });
    const hunt = await newHunt(fields);
    const before = (await pb.outbox()).length;

    const response = await send(hunt.id);

    expect(response.status).toBe(409);
    expect(response.body.data.code).toBe(code);
    expect(response.body.message).toEqual(expect.any(String));
    expect(await invitationsOf(hunt.id)).toHaveLength(0);
    expect(await pb.outbox()).toHaveLength(before);
  });

  it("sets the default deadline (48 h) when the hunt has none", async () => {
    const hunt = await newHunt({ response_deadline: "" });
    const start = Date.now();

    const response = await send(hunt.id);

    expect(response.status).toBe(200);
    const updated = await pb.api(recordsPath("hunts", hunt.id), {
      token: pb.organizerToken,
    });
    const deadline = Date.parse(
      updated.body.response_deadline.replace(" ", "T"),
    );
    const hours48 = 48 * 3600 * 1000;
    expect(deadline).toBeGreaterThanOrEqual(start + hours48 - 5000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + hours48 + 5000);
  });

  it("adds the day line only for members with several open invitations", async () => {
    const member = await create("members", {
      name: "Paul Moreau",
      phone: nextPhone(),
    });
    const firstHunt = await newHunt();
    const secondHunt = await newHunt();

    await send(firstHunt.id);
    await send(secondHunt.id);

    const texts = (await pb.outbox())
      .filter((message) => message.to === member.phone)
      .map((message) => message.text);
    const day = (hunt: Record<string, string>) =>
      String(Number(hunt.date?.slice(8, 10)));
    const withDay = (hunt: Record<string, string>) =>
      texts.filter((text) => text.includes(`OUI ${day(hunt)}`));
    expect(texts).toHaveLength(2);
    expect(withDay(firstHunt)).toHaveLength(0);
    expect(withDay(secondHunt)).toHaveLength(1);
  });

  it("does not count answered invitations as open", async () => {
    const member = await create("members", {
      name: "Paul Moreau",
      phone: nextPhone(),
    });
    const firstHunt = await newHunt();
    await send(firstHunt.id);
    const [invitation] = await invitationsOf(firstHunt.id);
    await pb.api(recordsPath("invitations", invitation?.id), {
      method: "PATCH",
      token: pb.organizerToken,
      body: { participation: "absent", answered_via: "manual" },
    });
    const secondHunt = await newHunt();

    await send(secondHunt.id);

    const texts = (await pb.outbox())
      .filter((message) => message.to === member.phone)
      .map((message) => message.text);
    expect(texts.filter((text) => /OUI \d/.test(text))).toHaveLength(0);
  });

  it("writes SMS in GSM-7 (no circumflex in August)", async () => {
    const member = await create("members", {
      name: "Paul Moreau",
      phone: nextPhone(),
      email: uniqueEmail(),
    });
    const hunt = await create("hunts", {
      date: "2111-08-15",
      meeting_time: "08:00",
      response_deadline: "2111-08-13 17:00:00.000Z",
    });

    await send(hunt.id);

    const messages = (await pb.outbox()).filter(
      (message) => message.to === member.phone || message.to === member.email,
    );
    expect(messages.find((m) => m.kind === "sms")?.text).toContain("15 aout");
    expect(messages.find((m) => m.kind === "email")?.text).toContain("15 août");
  });
});
