// SMS replies that were not recognized: the "to check" queue.
import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  createOrganizer,
  phoneNumbers,
  recordsPath,
  type ApiResponse,
} from "./api.js";
import { describeOrganizerOnlyAccess } from "./organizer-only.js";

const nextPhone = phoneNumbers(3);

describeOrganizerOnlyAccess(
  "sms_review_queue",
  async () => ({ from_phone: nextPhone(), body: "oui mais pas le 15" }),
  async () => ({ resolved: true }),
);

describe("sms_review_queue", () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await createOrganizer());
  });

  function create(body: Record<string, unknown>): Promise<ApiResponse> {
    return api(recordsPath("sms_review_queue"), {
      method: "POST",
      token,
      body,
    });
  }

  it("queues an unresolved message, received now by default", async () => {
    const before = Date.now();
    const from_phone = nextPhone();

    const response = await create({ from_phone, body: "oui ?" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      from_phone,
      body: "oui ?",
      member: "",
      resolved: false,
    });
    const receivedAt = Date.parse(response.body.received_at.replace(" ", "T"));
    expect(receivedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(receivedAt).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("keeps the reception time given by the SMS gateway", async () => {
    const response = await create({
      from_phone: nextPhone(),
      body: "Non… enfin oui",
      received_at: "2026-11-07 09:15:00.000Z",
    });

    expect(response.body.received_at).toBe("2026-11-07 09:15:00.000Z");
  });

  it.each(["from_phone", "body"])("requires a %s", async (field) => {
    const body: Record<string, unknown> = {
      from_phone: nextPhone(),
      body: "oui ?",
    };
    delete body[field];

    const response = await create(body);

    expect(response.status).toBe(400);
    expect(response.body.data[field].code).toBe("validation_required");
  });

  it("is deleted with the member it was matched to", async () => {
    const phone = nextPhone();
    const member = await api(recordsPath("members"), {
      method: "POST",
      token,
      body: { name: "Jacques Lefèvre", phone },
    });
    const queued = await create({
      from_phone: phone,
      body: "oui ?",
      member: member.body.id,
    });
    expect(queued.body.member).toBe(member.body.id);

    await api(recordsPath("members", member.body.id), {
      method: "DELETE",
      token,
    });

    const viewed = await api(recordsPath("sms_review_queue", queued.body.id), {
      token,
    });
    expect(viewed.status).toBe(404);
  });
});
