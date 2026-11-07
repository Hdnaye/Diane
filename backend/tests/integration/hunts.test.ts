import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  createOrganizer,
  huntDays,
  recordsPath,
  type ApiResponse,
} from "./api.js";
import { describeOrganizerOnlyAccess } from "./organizer-only.js";

describeOrganizerOnlyAccess(
  "hunts",
  (() => {
    const nextDay = huntDays(2103);
    return async () => ({ date: nextDay(), meeting_time: "08:00" });
  })(),
  async () => ({ meeting_time: "08:30" }),
);

describe("hunts", () => {
  // January: Paris is UTC+1, so 08:00 in Paris is 07:00 UTC.
  const nextDay = huntDays(2101);
  let token: string;

  beforeAll(async () => {
    ({ token } = await createOrganizer());
  });

  function create(body: Record<string, unknown>): Promise<ApiResponse> {
    return api(recordsPath("hunts"), { method: "POST", token, body });
  }

  function update(
    id: string,
    body: Record<string, unknown>,
  ): Promise<ApiResponse> {
    return api(recordsPath("hunts", id), { method: "PATCH", token, body });
  }

  it("creates a draft hunt on a day, at a meeting time", async () => {
    const date = nextDay();

    const response = await create({ date, meeting_time: "08:00" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      date,
      meeting_time: "08:00",
      status: "draft",
      max_participants: 0,
      response_deadline: "",
      invitations_sent_at: "",
      reminder_sent_at: "",
    });
  });

  it.each([
    ["missing", undefined, "validation_required"],
    ["not a calendar day", "2101-02-29", "invalid_date"],
    ["not YYYY-MM-DD", "1/3/2101", "validation_invalid_format"],
    ["with a time", "2101-03-01 08:00", "validation_invalid_format"],
  ])("rejects a date %s", async (_label, date, code) => {
    const response = await create({ date, meeting_time: "08:00" });

    expect(response.status).toBe(400);
    expect(response.body.data.date.code).toBe(code);
  });

  it.each([
    ["missing", undefined],
    ["8h00", "8h00"],
    ["8:00", "8:00"],
    ["24:00", "24:00"],
    ["07:60", "07:60"],
  ])("rejects a meeting time %s", async (_label, meeting_time) => {
    const response = await create({ date: nextDay(), meeting_time });

    expect(response.status).toBe(400);
    expect(response.body.data.meeting_time).toBeDefined();
  });

  it("allows at most one hunt per day", async () => {
    const date = nextDay();
    await create({ date, meeting_time: "08:00" });

    const response = await create({ date, meeting_time: "14:00" });

    expect(response.status).toBe(400);
    expect(response.body.data.date.code).toBe("validation_not_unique");
  });

  it("accepts a maximum number of participants of at least 1", async () => {
    const response = await create({
      date: nextDay(),
      meeting_time: "08:00",
      max_participants: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body.max_participants).toBe(1);
  });

  it.each([-1, 2.5])(
    "rejects a maximum number of participants of %d",
    async (max_participants) => {
      const response = await create({
        date: nextDay(),
        meeting_time: "08:00",
        max_participants,
      });

      expect(response.status).toBe(400);
      expect(response.body.data.max_participants).toBeDefined();
    },
  );

  it("accepts a response deadline before the hunt starts", async () => {
    const date = nextDay();

    const response = await create({
      date,
      meeting_time: "08:00",
      response_deadline: `${date} 06:59:00.000Z`,
    });

    expect(response.status).toBe(200);
    expect(response.body.response_deadline).toBe(`${date} 06:59:00.000Z`);
  });

  it("rejects a response deadline when the hunt starts or later", async () => {
    const date = nextDay();

    const response = await create({
      date,
      meeting_time: "08:00",
      response_deadline: `${date} 07:00:00.000Z`,
    });

    expect(response.status).toBe(400);
    expect(response.body.data.response_deadline.code).toBe(
      "deadline_after_hunt",
    );
  });

  it("rejects a meeting time moved before the response deadline", async () => {
    const date = nextDay();
    const created = await create({
      date,
      meeting_time: "08:00",
      response_deadline: `${date} 06:00:00.000Z`,
    });

    const response = await update(created.body.id, { meeting_time: "06:30" });

    expect(response.status).toBe(400);
    expect(response.body.data.response_deadline.code).toBe(
      "deadline_after_hunt",
    );
  });

  it.each(["draft", "invitations_sent", "closed", "cancelled"])(
    "accepts the status %s",
    async (status) => {
      const response = await create({
        date: nextDay(),
        meeting_time: "08:00",
        status,
      });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(status);
    },
  );

  it("rejects an unknown status", async () => {
    const response = await create({
      date: nextDay(),
      meeting_time: "08:00",
      status: "open",
    });

    expect(response.status).toBe(400);
    expect(response.body.data.status).toBeDefined();
  });

  it("records when invitations and the reminder were sent", async () => {
    const date = nextDay();
    const created = await create({ date, meeting_time: "08:00" });

    const response = await update(created.body.id, {
      invitations_sent_at: "2100-12-20 10:00:00.000Z",
      reminder_sent_at: "2100-12-22 10:00:00.000Z",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      invitations_sent_at: "2100-12-20 10:00:00.000Z",
      reminder_sent_at: "2100-12-22 10:00:00.000Z",
    });
  });
});
