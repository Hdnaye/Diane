// Organizer access (CLAUDE.md, "Accès organisateur (POC)"): no login screen,
// the app authenticates silently with a long secret key, the password of
// the single `organizers` account.
import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  authWithPassword,
  createOrganizer,
  randomSecret,
  recordsPath,
  superuserToken,
  uniqueEmail,
  type Organizer,
} from "./api.js";

describe("organizers collection", () => {
  let organizer: Organizer;

  beforeAll(async () => {
    organizer = await createOrganizer();
  });

  it("lets an organizer authenticate with its email and secret key", async () => {
    const response = await authWithPassword(
      "organizers",
      organizer.email,
      organizer.password,
    );

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.record.collectionName).toBe("organizers");
  });

  it("rejects a wrong secret key", async () => {
    const response = await authWithPassword(
      "organizers",
      organizer.email,
      randomSecret(),
    );

    expect(response.status).toBe(400);
  });

  it("refuses anonymous sign-up", async () => {
    const password = randomSecret();
    const response = await api(recordsPath("organizers"), {
      method: "POST",
      body: {
        email: uniqueEmail("intruder"),
        password,
        passwordConfirm: password,
      },
    });

    expect(response.status).toBe(401);
  });

  it("does not let an organizer create, update or delete accounts", async () => {
    const password = randomSecret();
    const { token, id } = organizer;

    const created = await api(recordsPath("organizers"), {
      method: "POST",
      token,
      body: {
        email: uniqueEmail("other"),
        password,
        passwordConfirm: password,
      },
    });
    const updated = await api(recordsPath("organizers", id), {
      method: "PATCH",
      token,
      body: { email: uniqueEmail("renamed") },
    });
    const deleted = await api(recordsPath("organizers", id), {
      method: "DELETE",
      token,
    });

    expect(created.status).toBe(403);
    expect(updated.status).toBe(403);
    expect(deleted.status).toBe(403);
  });

  it("only shows an organizer its own account", async () => {
    const other = await createOrganizer();

    const list = await api(recordsPath("organizers"), {
      token: organizer.token,
    });
    const view = await api(recordsPath("organizers", other.id), {
      token: organizer.token,
    });

    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([
      organizer.id,
    ]);
    expect(view.status).toBe(404);
  });

  it.each([
    ["anonymous", undefined],
    ["invalid token", "not-a-valid-token"],
  ])(
    "refuses organizer accounts to %s requests with a 401",
    async (_label, token) => {
      const list = await api(recordsPath("organizers"), { token });
      const view = await api(recordsPath("organizers", organizer.id), {
        token,
      });

      expect(list.status).toBe(401);
      expect(list.body.items).toBeUndefined();
      expect(view.status).toBe(401);
    },
  );

  it("requires a secret key of at least 32 characters", async () => {
    const password = "short-key-1234567890";
    const response = await api(recordsPath("organizers"), {
      method: "POST",
      token: await superuserToken(),
      body: { email: uniqueEmail("weak"), password, passwordConfirm: password },
    });

    expect(response.status).toBe(400);
    expect(response.body.data.password.code).toBe(
      "validation_min_text_constraint",
    );
  });

  it.each(["otp", "oauth2"])(
    "offers no other way to authenticate (%s disabled)",
    async (method) => {
      const response = await api("/api/collections/organizers/auth-methods");

      expect(response.status).toBe(200);
      expect(response.body[method].enabled).toBe(false);
    },
  );
});

// Organizer accounts are managed by superusers only: no e-mail flow may
// reset the key, verify or change the address, whoever asks.
describe("organizers account e-mail flows", () => {
  let organizer: Organizer;
  let collectionId: string;

  beforeAll(async () => {
    organizer = await createOrganizer();
    const collection = await api("/api/collections/organizers", {
      token: await superuserToken(),
    });
    collectionId = collection.body.id;
  });

  const ANONYMOUS_FLOWS = [
    "request-password-reset",
    "request-verification",
  ] as const;

  describe.each(["name", "id"])("addressed by collection %s", (by) => {
    const base = () =>
      `/api/collections/${by === "name" ? "organizers" : collectionId}`;

    it.each(ANONYMOUS_FLOWS)(
      "refuses %s for the organizer's email",
      async (flow) => {
        const response = await api(`${base()}/${flow}`, {
          method: "POST",
          body: { email: organizer.email },
        });

        expect(response.status).toBe(403);
      },
    );

    // Same answer as for the organizer's email: it cannot be guessed.
    it.each(ANONYMOUS_FLOWS)(
      "refuses %s for an unknown email",
      async (flow) => {
        const response = await api(`${base()}/${flow}`, {
          method: "POST",
          body: { email: uniqueEmail("unknown") },
        });

        expect(response.status).toBe(403);
      },
    );

    it("refuses request-email-change, even to the organizer", async () => {
      const response = await api(`${base()}/request-email-change`, {
        method: "POST",
        token: organizer.token,
        body: { newEmail: uniqueEmail("new") },
      });

      expect(response.status).toBe(403);
    });

    it.each([
      [
        "confirm-password-reset",
        { token: "x", password: "y", passwordConfirm: "y" },
      ],
      ["confirm-verification", { token: "x" }],
      ["confirm-email-change", { token: "x", password: "y" }],
    ])("refuses %s", async (flow, body) => {
      const response = await api(`${base()}/${flow}`, {
        method: "POST",
        body,
      });

      expect(response.status).toBe(403);
    });
  });
});

describe("default users collection", () => {
  // Created by PocketBase with open sign-up: no use here, and an attack
  // surface (anyone could create an account).
  it("does not exist", async () => {
    const response = await api("/api/collections/users/auth-methods");

    expect(response.status).toBe(404);
  });

  it("refuses anonymous sign-up", async () => {
    const password = randomSecret();
    const response = await api(recordsPath("users"), {
      method: "POST",
      body: {
        email: uniqueEmail("intruder"),
        password,
        passwordConfirm: password,
      },
    });

    expect(response.status).toBe(404);
  });
});
