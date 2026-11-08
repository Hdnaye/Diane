// Members' answers through their personal link: public routes, reached by
// the invitation token only (CLAUDE.md, "Accès organisateur (POC)").
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { huntDays, phoneNumbers, recordsPath, uniqueEmail } from "./api.js";
import { startTestInstance, type TestInstance } from "./instance.js";

const nextPhone = phoneNumbers(41);
const nextDay = huntDays(2112);
const DEADLINE = "2111-12-01 17:00:00.000Z";

type ApiRecord = Record<string, string> & {
  id: string;
  token: string;
  phone: string;
  email: string;
  name: string;
  answered_at: string;
};

describe("web answers", () => {
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
  ): Promise<ApiRecord> {
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
      status: "invitations_sent",
      ...fields,
    });

  const newMember = () =>
    create("members", {
      name: "Paul Moreau",
      phone: nextPhone(),
      email: uniqueEmail(),
    });

  async function invite(hunt: ApiRecord, member?: ApiRecord) {
    return create("invitations", {
      hunt: hunt.id,
      member: (member ?? (await newMember())).id,
    });
  }

  const view = (token: string) => pb.api(`/api/diane/r/${token}`);
  const answer = (token: string, body: unknown) =>
    pb.api(`/api/diane/r/${token}`, { method: "POST", body });
  const record = async (id: string): Promise<ApiRecord> =>
    (
      await pb.api(recordsPath("invitations", id), {
        token: pb.organizerToken,
      })
    ).body;

  describe("GET /api/diane/r/{token}", () => {
    it("shows the hunt and the member's own answer, nothing personal", async () => {
      const hunt = await newHunt({
        date: "2112-11-14",
        response_deadline: "2112-11-12 17:00:00.000Z",
      });
      const member = await newMember();
      const invitation = await invite(hunt, member);

      const response = await view(invitation.token);

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        hunt: {
          date: "2112-11-14",
          date_label: "lundi 14 novembre",
          meeting_time: "08:00",
          time_label: "8h00",
          cancelled: false,
        },
        deadline: "2112-11-12 17:00:00.000Z",
        deadline_label: "samedi 12 novembre à 18h00",
        participation: "pending",
        answer: null,
        can_answer: true,
        refusal: null,
      });
      const json = JSON.stringify(response.body);
      for (const value of [
        member.phone,
        member.email,
        member.name,
        member.id,
        hunt.id,
        invitation.id,
      ]) {
        expect(json).not.toContain(value);
      }
    });

    it.each([
      ["unknown", "A".repeat(43)],
      ["malformed", "not-a-token"],
      ["too short", "abc"],
    ])("answers a generic 404 for a %s token", async (_, token) => {
      const response = await view(token);

      expect(response.status).toBe(404);
      expect(response.body.data).toStrictEqual({});
    });

    it("tells when the hunt is cancelled", async () => {
      const hunt = await newHunt({ status: "cancelled" });
      const invitation = await invite(hunt);

      const response = await view(invitation.token);

      expect(response.body.hunt.cancelled).toBe(true);
      expect(response.body.can_answer).toBe(false);
    });

    it("tells when the deadline has passed", async () => {
      const hunt = await newHunt({
        response_deadline: "2020-01-01 10:00:00.000Z",
      });
      const invitation = await invite(hunt);

      const response = await view(invitation.token);

      expect(response.body.can_answer).toBe(false);
      expect(response.body.refusal.code).toBe("deadline_passed");
    });
  });

  describe("POST /api/diane/r/{token}", () => {
    it("records a yes as present, answered on the web", async () => {
      const invitation = await invite(await newHunt());
      const before = Date.now();

      const response = await answer(invitation.token, { answer: "yes" });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        participation: "present",
        answer: "yes",
        can_answer: true,
      });
      const stored = await record(invitation.id);
      expect(stored).toMatchObject({
        participation: "present",
        answered_via: "web",
      });
      expect(
        Date.parse(stored.answered_at.replace(" ", "T")),
      ).toBeGreaterThanOrEqual(before - 1000);
    });

    it("records a no as absent", async () => {
      const invitation = await invite(await newHunt());

      const response = await answer(invitation.token, { answer: "no" });

      expect(response.status).toBe(200);
      expect((await record(invitation.id)).participation).toBe("absent");
    });

    it("lets the member change the answer before the deadline", async () => {
      const invitation = await invite(await newHunt());

      await answer(invitation.token, { answer: "yes" });
      await answer(invitation.token, { answer: "no" });
      const response = await answer(invitation.token, { answer: "yes" });

      expect(response.body.participation).toBe("present");
      expect((await view(invitation.token)).body.participation).toBe("present");
    });

    it.each([{}, { answer: "maybe" }, { answer: "YES" }, { answer: 1 }])(
      "rejects an invalid answer %j",
      async (body) => {
        const invitation = await invite(await newHunt());

        const response = await answer(invitation.token, body);

        expect(response.status).toBe(400);
        expect((await record(invitation.id)).participation).toBe("pending");
      },
    );

    it("answers 404 for an unknown token", async () => {
      expect((await answer("B".repeat(43), { answer: "yes" })).status).toBe(
        404,
      );
    });

    it("refuses an answer after the deadline, with a clear message", async () => {
      const hunt = await newHunt({
        response_deadline: "2020-01-01 10:00:00.000Z",
      });
      const invitation = await invite(hunt);

      const response = await answer(invitation.token, { answer: "yes" });

      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/date limite/);
      expect(response.body.data.answer.code).toBe("deadline_passed");
      expect((await record(invitation.id)).participation).toBe("pending");
    });

    it("refuses an answer to a cancelled hunt", async () => {
      const invitation = await invite(await newHunt({ status: "cancelled" }));

      const response = await answer(invitation.token, { answer: "yes" });

      expect(response.status).toBe(409);
      expect(response.body.data.answer.code).toBe("hunt_cancelled");
      expect((await record(invitation.id)).participation).toBe("pending");
    });
  });

  describe("waiting list", () => {
    it("never exceeds the maximum under concurrent answers", async () => {
      const hunt = await newHunt({ max_participants: 2 });
      const invitations = await Promise.all(
        Array.from({ length: 6 }, () => invite(hunt)),
      );

      const responses = await Promise.all(
        invitations.map((invitation) =>
          answer(invitation.token, { answer: "yes" }),
        ),
      );

      expect(responses.map((response) => response.status)).toEqual(
        Array(6).fill(200),
      );
      const participations = responses.map(
        (response) => response.body.participation,
      );
      expect(participations.filter((p) => p === "present")).toHaveLength(2);
      expect(participations.filter((p) => p === "waiting_list")).toHaveLength(
        4,
      );
    });

    it("frees a place on withdrawal without promoting anyone", async () => {
      const hunt = await newHunt({ max_participants: 1 });
      const first = await invite(hunt);
      const second = await invite(hunt);
      const third = await invite(hunt);
      await answer(first.token, { answer: "yes" });
      await answer(second.token, { answer: "yes" });

      await answer(first.token, { answer: "no" });
      const late = await answer(third.token, { answer: "yes" });

      expect((await record(second.id)).participation).toBe("waiting_list");
      // The freed place waits for the organizer's decision.
      expect(late.body.participation).toBe("waiting_list");
      const attendance = await pb.api(
        `/api/diane/hunts/${hunt.id}/attendance`,
        { token: pb.organizerToken },
      );
      expect(attendance.status).toBe(200);
      expect(attendance.body).toStrictEqual({
        present: 0,
        waiting_list: [second.id, third.id],
        absent: 1,
        pending: 0,
        max_participants: 1,
        free_places: 1,
      });
    });

    it("keeps the place of a member answering yes again", async () => {
      const hunt = await newHunt({ max_participants: 1 });
      const first = await invite(hunt);
      const second = await invite(hunt);
      await answer(first.token, { answer: "yes" });
      await answer(second.token, { answer: "yes" });
      const answeredAt = (await record(second.id)).answered_at;

      const again = await answer(second.token, { answer: "yes" });

      expect(again.body.participation).toBe("waiting_list");
      expect((await record(second.id)).answered_at).toBe(answeredAt);
    });

    it("has no limit when max_participants is empty", async () => {
      const hunt = await newHunt();
      const invitations = await Promise.all(
        Array.from({ length: 4 }, () => invite(hunt)),
      );

      const responses = await Promise.all(
        invitations.map((invitation) =>
          answer(invitation.token, { answer: "yes" }),
        ),
      );

      expect(
        responses.every(
          (response) => response.body.participation === "present",
        ),
      ).toBe(true);
    });

    it("shows the attendance to the organizer only", async () => {
      const hunt = await newHunt();

      const response = await pb.api(`/api/diane/hunts/${hunt.id}/attendance`);

      expect(response.status).toBe(401);
    });
  });
});
