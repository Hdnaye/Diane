// RGPD purge of SMS data (dianePurgeSmsData, daily): resolved "to check"
// SMS 30 days after resolution, any of them 90 days after reception, the
// ids of handled webhooks after 7 days.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { phoneNumbers, recordsPath } from "./api.js";
import { startTestInstance, type TestInstance } from "./instance.js";

const nextPhone = phoneNumbers(53);
const DAY = 24 * 60 * 60 * 1000;

const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY).toISOString().replace("T", " ");

describe("SMS data retention", () => {
  let pb: TestInstance;

  beforeAll(async () => {
    pb = await startTestInstance();
  });

  afterAll(async () => {
    await pb?.stop();
  });

  async function queue(fields: Record<string, unknown>) {
    const response = await pb.api(recordsPath("sms_review_queue"), {
      method: "POST",
      token: pb.organizerToken,
      body: { from_phone: nextPhone(), body: "oui ?", ...fields },
    });
    expect(response.status).toBe(200);
    return response.body as { id: string; resolved_at: string };
  }

  const exists = async (collection: string, id: string) =>
    (await pb.api(recordsPath(collection, id), { token: pb.superuserToken }))
      .status === 200;

  it("is scheduled daily", async () => {
    const response = await pb.api("/api/crons", { token: pb.superuserToken });

    expect(response.body).toContainEqual({
      id: "dianePurgeSmsData",
      expression: "17 3 * * *",
    });
  });

  it("records when a queued SMS gets resolved, and clears it when reopened", async () => {
    const item = await queue({ resolved: true });
    expect(item.resolved_at).not.toBe("");

    const reopened = await pb.api(recordsPath("sms_review_queue", item.id), {
      method: "PATCH",
      token: pb.organizerToken,
      body: { resolved: false },
    });

    expect(reopened.body.resolved_at).toBe("");
  });

  it("deletes resolved SMS after 30 days and any SMS after 90 days", async () => {
    const resolvedOld = await queue({
      resolved: true,
      resolved_at: daysAgo(31),
      received_at: daysAgo(40),
    });
    const resolvedRecent = await queue({
      resolved: true,
      resolved_at: daysAgo(29),
      received_at: daysAgo(40),
    });
    const unresolvedOld = await queue({ received_at: daysAgo(91) });
    const unresolvedRecent = await queue({ received_at: daysAgo(89) });

    const run = await pb.api("/api/crons/dianePurgeSmsData", {
      method: "POST",
      token: pb.superuserToken,
    });
    expect(run.status).toBe(204);
    for (let i = 0; i < 50; i++) {
      if (
        !(await exists("sms_review_queue", resolvedOld.id)) &&
        !(await exists("sms_review_queue", unresolvedOld.id))
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(await exists("sms_review_queue", resolvedOld.id)).toBe(false);
    expect(await exists("sms_review_queue", unresolvedOld.id)).toBe(false);
    expect(await exists("sms_review_queue", resolvedRecent.id)).toBe(true);
    expect(await exists("sms_review_queue", unresolvedRecent.id)).toBe(true);
  });
});
