// sms_inbound: ids of the SMS webhooks already handled. Readable by the
// organizer only; written by the webhook hook only (superusers).
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { api, createOrganizer, recordsPath, superuserToken } from "./api.js";

describe("sms_inbound access", () => {
  let organizerToken: string;
  let id: string;

  beforeAll(async () => {
    organizerToken = (await createOrganizer()).token;
    const created = await api(recordsPath("sms_inbound"), {
      method: "POST",
      token: await superuserToken(),
      body: { event_id: randomBytes(8).toString("hex"), outcome: "review" },
    });
    if (created.status !== 200) throw new Error("Setup failed");
    id = created.body.id;
  });

  it("refuses anonymous requests with an explicit 401", async () => {
    const list = await api(recordsPath("sms_inbound"));
    expect(list.status).toBe(401);
    expect(list.body.items).toBeUndefined();
    expect((await api(recordsPath("sms_inbound", id))).status).toBe(401);
    expect(
      (await api(recordsPath("sms_inbound"), { token: "invalid" })).status,
    ).toBe(401);
  });

  it("is readable by the organizer", async () => {
    const response = await api(recordsPath("sms_inbound", id), {
      token: organizerToken,
    });
    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).not.toContain("body");
  });

  it("cannot be written by the organizer", async () => {
    const created = await api(recordsPath("sms_inbound"), {
      method: "POST",
      token: organizerToken,
      body: { event_id: "forged", outcome: "applied" },
    });
    const patched = await api(recordsPath("sms_inbound", id), {
      method: "PATCH",
      token: organizerToken,
      body: { outcome: "applied" },
    });
    const deleted = await api(recordsPath("sms_inbound", id), {
      method: "DELETE",
      token: organizerToken,
    });

    expect(created.status).toBe(403);
    expect(patched.status).toBe(403);
    expect(deleted.status).toBe(403);
  });
});
