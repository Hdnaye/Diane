import { describe, expect, inject, it } from "vitest";

describe("test PocketBase instance", () => {
  const { url, superuser } = inject("pocketbase");

  it("lets the test superuser authenticate", async () => {
    const response = await fetch(
      `${url}/api/collections/_superusers/auth-with-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity: superuser.email,
          password: superuser.password,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("token");
  });
});
