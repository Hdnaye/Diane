import { describe, expect, inject, it } from "vitest";

describe("GET /api/diane/health", () => {
  const { url } = inject("pocketbase");

  it("responds 200 with { status: 'ok' }", async () => {
    const response = await fetch(`${url}/api/diane/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
