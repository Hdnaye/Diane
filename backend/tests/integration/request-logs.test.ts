// PocketBase's request logs (`_logs`, admin UI > Logs) and GDPR: no client
// IP, a short retention, and no answer link token (the URL of the answer
// routes and pages, and the Referer of the requests sent from the answer
// page, would carry it).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { huntDays, phoneNumbers, recordsPath } from "./api.js";
import {
  startTestInstance,
  TEST_PUBLIC_URL,
  type TestInstance,
} from "./instance.js";

const nextPhone = phoneNumbers(45);
const nextDay = huntDays(2118);
const DEADLINE = "2117-12-01 17:00:00.000Z";

/** Requests allowed per window by the /api/diane/r/ rule. */
const MAX_ANSWER_REQUESTS = 20;

describe("request logs", () => {
  let pb: TestInstance;

  beforeAll(async () => {
    pb = await startTestInstance({ rateLimited: true });
  });

  afterAll(async () => {
    await pb?.stop();
  });

  /** Every log entry, as the admin UI lists them. */
  async function allLogs(): Promise<{ message: string; data: object }[]> {
    const response = await pb.api("/api/logs?perPage=1000", {
      token: pb.superuserToken,
    });
    expect(response.status).toBe(200);
    return response.body.items;
  }

  /** Waits until `count` request logs match `predicate` (logs are batched). */
  async function waitForLogs(
    predicate: (entry: { message: string }) => boolean,
    count: number,
  ) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const logs = await allLogs();
      if (logs.filter(predicate).length >= count) return logs;
      if (Date.now() > deadline) {
        throw new Error(`Only ${logs.filter(predicate).length} logs`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  it("keeps logs 2 days, without client IP", async () => {
    const settings = await pb.api("/api/settings", {
      token: pb.superuserToken,
    });

    expect(settings.body.logs).toMatchObject({ maxDays: 2, logIP: false });
  });

  it(
    "logs neither the IP nor the token of answer requests",
    { timeout: 30_000 },
    async () => {
      const member = await pb.api(recordsPath("members"), {
        method: "POST",
        token: pb.organizerToken,
        body: { name: "Paul Moreau", phone: nextPhone() },
      });
      expect(member.status).toBe(200);
      const hunt = await pb.api(recordsPath("hunts"), {
        method: "POST",
        token: pb.organizerToken,
        body: {
          date: nextDay(),
          meeting_time: "08:00",
          response_deadline: DEADLINE,
        },
      });
      await pb.api(`/api/diane/hunts/${hunt.body.id}/send-invitations`, {
        method: "POST",
        token: pb.organizerToken,
      });
      const invitations = await pb.api(
        `${recordsPath("invitations")}?filter=${encodeURIComponent(`hunt="${hunt.body.id}"`)}`,
        { token: pb.organizerToken },
      );
      const token: string = invitations.body.items[0].token;
      const unknown = "C".repeat(43);
      const referer = `${TEST_PUBLIC_URL}/r/${token}`;
      const call = (pathname: string, method = "GET", body?: unknown) =>
        fetch(`${pb.process.url}${pathname}`, {
          method,
          headers: { Referer: referer, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

      // Answer page and routes: success, refusal, unknown token, and
      // rate limited (429, before any route handler).
      expect((await call(`/api/diane/r/${token}`)).status).toBe(200);
      expect(
        (await call(`/api/diane/r/${token}?x=1`, "POST", { answer: "yes" }))
          .status,
      ).toBe(200);
      expect(
        (await call(`/api/diane/r/${token}`, "POST", { answer: "maybe" }))
          .status,
      ).toBe(400);
      await call(`/r/${token}`);
      const statuses: number[] = [];
      for (let i = 0; i <= MAX_ANSWER_REQUESTS; i++) {
        statuses.push((await call(`/api/diane/r/${unknown}`)).status);
      }
      expect(statuses).toContain(429);
      // Another request from the answer page (Referer only).
      await call("/api/diane/health");

      const logs = await waitForLogs(
        (entry) => entry.message.includes("/r/"),
        MAX_ANSWER_REQUESTS + 5,
      );

      const text = JSON.stringify(logs);
      expect(text).not.toContain(token);
      expect(text).not.toContain(unknown);
      expect(text).not.toMatch(/userIP|remoteIP/);
      expect(text).not.toContain("127.0.0.1");
      // Still useful: the route and the outcome.
      expect(
        logs.some(
          (entry) =>
            entry.message.startsWith("GET /api/diane/r/") &&
            (entry.data as { status?: number }).status === 429,
        ),
      ).toBe(true);
    },
  );
});
