// Organizer accounts are managed by superusers only: even if OTP were
// enabled on `organizers` by mistake (admin UI), nobody may request or use a
// login code by e-mail. Own instance: the shared one keeps OTP disabled.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startPocketBase,
  type PocketBaseProcess,
} from "./pocketbase-process.js";

describe("organizers OTP flows", () => {
  let pocketbase: PocketBaseProcess;
  let collectionId: string;
  const organizerEmail = `organizer-${randomBytes(6).toString("hex")}@example.com`;

  async function call(
    method: string,
    pathname: string,
    body: unknown,
    token?: string,
  ) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = token;
    const response = await fetch(`${pocketbase.url}${pathname}`, {
      method,
      headers,
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  beforeAll(async () => {
    const superuser = {
      email: "superuser@diane.test",
      password: randomBytes(16).toString("hex"),
    };
    pocketbase = await startPocketBase({ superuser });
    const auth = await call(
      "POST",
      "/api/collections/_superusers/auth-with-password",
      { identity: superuser.email, password: superuser.password },
    );
    const token = auth.body.token as string;
    const enabled = await call(
      "PATCH",
      "/api/collections/organizers",
      { otp: { enabled: true } },
      token,
    );
    expect(enabled.status).toBe(200);
    collectionId = enabled.body.id;
    const password = randomBytes(32).toString("hex");
    const created = await call(
      "POST",
      "/api/collections/organizers/records",
      { email: organizerEmail, password, passwordConfirm: password },
      token,
    );
    expect(created.status).toBe(200);
  });

  afterAll(async () => {
    await pocketbase?.stop();
  });

  describe.each(["name", "id"])("addressed by collection %s", (by) => {
    const base = () =>
      `/api/collections/${by === "name" ? "organizers" : collectionId}`;

    it("refuses request-otp", async () => {
      const response = await call("POST", `${base()}/request-otp`, {
        email: organizerEmail,
      });

      expect(response.status).toBe(403);
    });

    it("refuses auth-with-otp", async () => {
      const response = await call("POST", `${base()}/auth-with-otp`, {
        otpId: "x".repeat(15),
        password: "y",
      });

      expect(response.status).toBe(403);
    });
  });
});
