// PocketBase's rate limiter guards the public answer routes (per IP,
// guests): tokens are unguessable, this only slows down abuse. PocketBase's
// default rules only apply to guests: the organizer (authenticated) has its
// own, broad limit. This instance does not exempt 127.0.0.1.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { phoneNumbers, recordsPath } from "./api.js";
import { startTestInstance, type TestInstance } from "./instance.js";

const nextPhone = phoneNumbers(44);

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

  it("is enabled: answer routes first, default rules for guests only", async () => {
    const settings = await pb.api("/api/settings", {
      token: pb.superuserToken,
    });

    expect(settings.body.rateLimits.enabled).toBe(true);
    expect(settings.body.rateLimits.excludedIPs).toStrictEqual([]);
    expect(settings.body.rateLimits.rules).toStrictEqual([
      {
        label: "/api/diane/r/",
        audience: "@guest",
        duration: 10,
        maxRequests: MAX_REQUESTS,
      },
      { label: "*:auth", audience: "@guest", duration: 3, maxRequests: 2 },
      { label: "*:create", audience: "@guest", duration: 5, maxRequests: 20 },
      { label: "/api/batch", audience: "@guest", duration: 1, maxRequests: 3 },
      { label: "/api/", audience: "@guest", duration: 10, maxRequests: 300 },
      { label: "/api/", audience: "@auth", duration: 10, maxRequests: 600 },
    ]);
  });

  it("does not throttle the organizer creating 30 records in a row", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) {
      const response = await pb.api(recordsPath("members"), {
        method: "POST",
        token: pb.organizerToken,
        body: { name: `Membre ${i}`, phone: nextPhone() },
      });
      statuses.push(response.status);
    }

    expect(statuses.filter((status) => status !== 200)).toStrictEqual([]);
  });

  it("still throttles guests creating records", async () => {
    const statuses: number[] = [];
    for (let i = 0; i <= 20; i++) {
      const response = await pb.api(recordsPath("members"), {
        method: "POST",
        body: { name: "Paul Moreau", phone: nextPhone() },
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 20)).not.toContain(429);
    expect(statuses.at(-1)).toBe(429);
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
