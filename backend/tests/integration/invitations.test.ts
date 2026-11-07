import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  createOrganizer,
  huntDays,
  phoneNumbers,
  recordsPath,
  superuserToken,
  type ApiResponse,
} from "./api.js";
import { describeOrganizerOnlyAccess } from "./organizer-only.js";

const nextPhone = phoneNumbers(2);
const nextAccessDay = huntDays(2104);
const nextDay = huntDays(2102);

async function createAsSuperuser(
  collection: string,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await api(recordsPath(collection), {
    method: "POST",
    token: await superuserToken(),
    body,
  });
  if (response.status !== 200) {
    throw new Error(`Setup failed: HTTP ${response.status}`);
  }
  return response.body.id;
}

const newMember = () =>
  createAsSuperuser("members", { name: "Paul Moreau", phone: nextPhone() });

describeOrganizerOnlyAccess(
  "invitations",
  async () => ({
    hunt: await createAsSuperuser("hunts", {
      date: nextAccessDay(),
      meeting_time: "08:00",
    }),
    member: await newMember(),
  }),
  async () => ({ participation: "present", answered_via: "manual" }),
);

describe("invitations", () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await createOrganizer());
  });

  const newHunt = () =>
    createAsSuperuser("hunts", { date: nextDay(), meeting_time: "08:00" });

  function create(body: Record<string, unknown>): Promise<ApiResponse> {
    return api(recordsPath("invitations"), { method: "POST", token, body });
  }

  function update(
    id: string,
    body: Record<string, unknown>,
  ): Promise<ApiResponse> {
    return api(recordsPath("invitations", id), {
      method: "PATCH",
      token,
      body,
    });
  }

  function view(collection: string, id: string): Promise<ApiResponse> {
    return api(recordsPath(collection, id), { token });
  }

  it("creates a pending invitation of a member to a hunt", async () => {
    const hunt = await newHunt();
    const member = await newMember();

    const response = await create({ hunt, member });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      hunt,
      member,
      participation: "pending",
      answered_at: "",
      answered_via: "",
    });
  });

  it("generates a long random token on the server", async () => {
    const hunt = await newHunt();
    const [first, second] = await Promise.all([
      create({ hunt, member: await newMember() }),
      create({ hunt, member: await newMember() }),
    ]);

    for (const { body } of [first, second]) {
      expect(body.token).toMatch(/^[A-Za-z0-9]{32,}$/);
    }
    expect(first?.body.token).not.toBe(second?.body.token);
  });

  it("puts no identifier or personal data in the token", async () => {
    const phone = nextPhone();
    const member = await createAsSuperuser("members", {
      name: "Paul Moreau",
      phone,
    });
    const hunt = await newHunt();

    const { body } = await create({ hunt, member });

    for (const value of [member, hunt, phone.slice(3), "moreau", "paul"]) {
      expect(body.token.toLowerCase()).not.toContain(value.toLowerCase());
    }
  });

  it("ignores a token chosen by the client", async () => {
    const chosen = "a".repeat(43);

    const response = await create({
      hunt: await newHunt(),
      member: await newMember(),
      token: chosen,
    });

    expect(response.status).toBe(200);
    expect(response.body.token).not.toBe(chosen);
    expect(response.body.token).toMatch(/^[A-Za-z0-9]{32,}$/);
  });

  it("does not let the token change", async () => {
    const created = await create({
      hunt: await newHunt(),
      member: await newMember(),
    });

    const response = await update(created.body.id, { token: "b".repeat(43) });

    expect(response.status).toBe(400);
    expect(response.body.data.token.code).toBe("token_immutable");
    expect((await view("invitations", created.body.id)).body.token).toBe(
      created.body.token,
    );
  });

  it("invites a member at most once per hunt", async () => {
    const hunt = await newHunt();
    const member = await newMember();
    await create({ hunt, member });

    const response = await create({ hunt, member });

    expect(response.status).toBe(400);
  });

  it("records an answer", async () => {
    const created = await create({
      hunt: await newHunt(),
      member: await newMember(),
    });

    const response = await update(created.body.id, {
      participation: "waiting_list",
      answered_at: "2101-12-20 10:00:00.000Z",
      answered_via: "sms",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      participation: "waiting_list",
      answered_at: "2101-12-20 10:00:00.000Z",
      answered_via: "sms",
    });
  });

  it.each([
    ["participation", "maybe"],
    ["answered_via", "email"],
  ])("rejects an unknown %s", async (field, value) => {
    const response = await create({
      hunt: await newHunt(),
      member: await newMember(),
      [field]: value,
    });

    expect(response.status).toBe(400);
    expect(response.body.data[field]).toBeDefined();
  });

  it.each(["hunt", "member"])("requires a %s", async (field) => {
    const body: Record<string, unknown> = {
      hunt: await newHunt(),
      member: await newMember(),
    };
    delete body[field];

    const response = await create(body);

    expect(response.status).toBe(400);
    expect(response.body.data[field].code).toBe("validation_required");
  });

  it.each(["hunts", "members"])(
    "is deleted with its %s record",
    async (collection) => {
      const hunt = await newHunt();
      const member = await newMember();
      const created = await create({ hunt, member });
      expect((await view("invitations", created.body.id)).status).toBe(200);

      const deleted = await api(
        recordsPath(collection, collection === "hunts" ? hunt : member),
        { method: "DELETE", token },
      );

      expect(deleted.status).toBe(204);
      expect((await view("invitations", created.body.id)).status).toBe(404);
    },
  );
});
