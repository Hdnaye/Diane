// Guests get an explicit 401 on organizer collections (organizer-only.ts),
// but the public routes stay reachable without the organizer key
// (CLAUDE.md, "Accès organisateur (POC)").
import { describe, expect, it } from "vitest";
import { api, randomSecret, uniqueEmail } from "./api.js";

describe("public routes for guests", () => {
  it("still answers the member's link routes", async () => {
    const token = "Z".repeat(43);

    const viewed = await api(`/api/diane/r/${token}`);
    const answered = await api(`/api/diane/r/${token}`, {
      method: "POST",
      body: { answer: "yes" },
    });

    expect(viewed.status).toBe(404);
    expect(answered.status).toBe(404);
  });

  it("still lets the app log in", async () => {
    const response = await api(
      "/api/collections/organizers/auth-with-password",
      {
        method: "POST",
        body: { identity: uniqueEmail("organizer"), password: randomSecret() },
      },
    );

    expect(response.status).toBe(400);
  });

  it("still lists the login methods", async () => {
    const response = await api("/api/collections/organizers/auth-methods");

    expect(response.status).toBe(200);
  });
});
