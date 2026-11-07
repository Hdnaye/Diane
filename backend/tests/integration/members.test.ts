import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  createOrganizer,
  phoneNumbers,
  recordsPath,
  uniqueEmail,
  type ApiResponse,
} from "./api.js";
import { describeOrganizerOnlyAccess } from "./organizer-only.js";

const nextPhone = phoneNumbers(1);

describeOrganizerOnlyAccess(
  "members",
  async () => ({ name: "Jean Dupont", email: uniqueEmail() }),
  async () => ({ name: "Jean Dupond" }),
);

describe("members", () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await createOrganizer());
  });

  function create(body: Record<string, unknown>): Promise<ApiResponse> {
    return api(recordsPath("members"), { method: "POST", token, body });
  }

  function update(
    id: string,
    body: Record<string, unknown>,
  ): Promise<ApiResponse> {
    return api(recordsPath("members", id), { method: "PATCH", token, body });
  }

  it("creates a member with a name and an email", async () => {
    const email = uniqueEmail();

    const response = await create({ name: "Marie Martin", email });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: "Marie Martin",
      email,
      phone: "",
    });
  });

  it("requires a name", async () => {
    const response = await create({ name: " ", email: uniqueEmail() });

    expect(response.status).toBe(400);
    expect(response.body.data.name.code).toBe("validation_required");
  });

  it("rejects an invalid email", async () => {
    const response = await create({ name: "Paul Petit", email: "paul@" });

    expect(response.status).toBe(400);
    expect(response.body.data.email).toBeDefined();
  });

  it("stores the phone number in E.164", async () => {
    const phone = nextPhone();
    const national = `0${phone.slice(3).replace(/(\d)(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5")}`;

    const response = await create({ name: "Luc Bernard", phone: national });

    expect(response.status).toBe(200);
    expect(response.body.phone).toBe(phone);
  });

  it("rejects a phone number that is not French", async () => {
    const response = await create({
      name: "Luc Bernard",
      phone: "+44 20 7946 0000",
    });

    expect(response.status).toBe(400);
    expect(response.body.data.phone.code).toBe("invalid_phone");
  });

  it("requires an email or a phone number", async () => {
    const response = await create({ name: "Anne Roux", email: "", phone: "" });

    expect(response.status).toBe(400);
    expect(response.body.data.email.code).toBe("missing_contact");
    expect(response.body.data.phone.code).toBe("missing_contact");
  });

  it("keeps an email or a phone number on update", async () => {
    const created = await create({ name: "Anne Roux", phone: nextPhone() });

    const removed = await update(created.body.id, { phone: "" });
    const replaced = await update(created.body.id, {
      phone: "",
      email: uniqueEmail(),
    });

    expect(removed.status).toBe(400);
    expect(removed.body.data.phone.code).toBe("missing_contact");
    expect(replaced.status).toBe(200);
  });

  it("is active by default", async () => {
    const response = await create({ name: "Henri Blanc", phone: nextPhone() });

    expect(response.body.active).toBe(true);
  });

  it("can be created inactive", async () => {
    const response = await create({
      name: "Henri Blanc",
      phone: nextPhone(),
      active: false,
    });

    expect(response.body.active).toBe(false);
  });

  it("rejects a phone number already used, whatever its format", async () => {
    const phone = nextPhone();
    await create({ name: "Louis Garnier", phone });

    const response = await create({
      name: "Louise Garnier",
      phone: phone.replace("+33", "0"),
    });

    expect(response.status).toBe(400);
    expect(response.body.data.phone.code).toBe("validation_not_unique");
  });

  it("rejects an email already used, whatever its case", async () => {
    const email = uniqueEmail();
    await create({ name: "Louis Garnier", email });

    const response = await create({
      name: "Louise Garnier",
      email: ` ${email.toUpperCase()} `,
    });

    expect(response.status).toBe(400);
    expect(response.body.data.email.code).toBe("validation_not_unique");
  });

  it("allows several members without email, or without phone", async () => {
    const responses = await Promise.all([
      create({ name: "Sans Courriel 1", phone: nextPhone() }),
      create({ name: "Sans Courriel 2", phone: nextPhone() }),
      create({ name: "Sans Téléphone 1", email: uniqueEmail() }),
      create({ name: "Sans Téléphone 2", email: uniqueEmail() }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 200,
    ]);
  });
});
