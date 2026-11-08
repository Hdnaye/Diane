// PocketBase's rate limiter guards the public answer routes (per IP,
// guests): tokens are unguessable, this only slows down abuse.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestInstance, type TestInstance } from "./instance.js";

/** Requests allowed per window by the /api/diane/r/ rule. */
const MAX_REQUESTS = 20;

describe("rate limits", () => {
  let pb: TestInstance;

  beforeAll(async () => {
    pb = await startTestInstance({ rateLimited: true });
  });

  afterAll(async () => {
    await pb?.stop();
  });

  it("is enabled, with a rule for the answer routes", async () => {
    const settings = await pb.api("/api/settings", {
      token: pb.superuserToken,
    });

    expect(settings.body.rateLimits.enabled).toBe(true);
    expect(settings.body.rateLimits.rules).toContainEqual({
      label: "/api/diane/r/",
      audience: "@guest",
      duration: 10,
      maxRequests: MAX_REQUESTS,
    });
  });

  it("throttles a guest hammering the answer routes", async () => {
    const statuses: number[] = [];
    for (let i = 0; i <= MAX_REQUESTS; i++) {
      const method = i % 2 === 0 ? "GET" : "POST";
      const response = await pb.api(`/api/diane/r/${"C".repeat(43)}`, {
        method,
        body: method === "POST" ? { answer: "yes" } : undefined,
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, MAX_REQUESTS).every((s) => s === 404)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
