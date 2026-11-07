import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { api, createOrganizer, recordsPath, type ApiResponse } from "./api.js";
import { describeOrganizerOnlyAccess } from "./organizer-only.js";

const require = createRequire(import.meta.url);
const { messageVariables, renderTemplate } =
  require("../../pb_hooks/lib/message-template.cjs") as typeof import("../../pb_hooks/lib/message-template.cjs");

describe("message_templates", () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await createOrganizer());
  });

  async function defaults(): Promise<{ id: string; body: string }[]> {
    const response = await api(
      `${recordsPath("message_templates")}?filter=${encodeURIComponent("is_default=true")}`,
      { token },
    );
    return response.body.items;
  }

  function create(body: Record<string, unknown>): Promise<ApiResponse> {
    return api(recordsPath("message_templates"), {
      method: "POST",
      token,
      body,
    });
  }

  // Runs first: later tests change the default template.
  describe("seeded default template", () => {
    let body: string;

    beforeAll(async () => {
      const [seeded] = await defaults();
      body = seeded?.body ?? "";
    });

    it("exists", () => {
      expect(body).not.toBe("");
    });

    it("uses every hunt variable and the answer link", () => {
      for (const variable of ["{date}", "{heure}", "{limite}", "{lien}"]) {
        expect(body).toContain(variable);
      }
    });

    it("explains how to answer by SMS", () => {
      expect(body).toContain("SMS");
      expect(body).toContain("OUI");
      expect(body).toContain("NON");
      expect(body).toContain("OUI {jour}");
    });

    it("renders as a short message without leftover placeholder", () => {
      const message = renderTemplate(
        body,
        messageVariables(
          {
            date: "2026-11-14",
            meeting_time: "08:00",
            response_deadline: "2026-11-12 17:00:00.000Z",
          },
          // 43-character token, like real links.
          `https://diane.example.org/r/${"x".repeat(43)}`,
        ),
      );

      expect(message).not.toMatch(/[{}]/);
      // At most 5 SMS segments in UCS-2 (accents): 5 x 67 characters.
      expect(message.length).toBeLessThanOrEqual(335);
    });
  });

  it.each(["name", "body"])("requires a %s", async (field) => {
    const body: Record<string, unknown> = {
      name: "Relance",
      body: "Battue le {date}",
    };
    delete body[field];

    const response = await create(body);

    expect(response.status).toBe(400);
    expect(response.body.data[field].code).toBe("validation_required");
  });

  it("keeps a single default template when a new one is created", async () => {
    const created = await create({
      name: "Nouveau modèle",
      body: "Battue le {date} à {heure}.",
      is_default: true,
    });

    expect(created.status).toBe(200);
    expect((await defaults()).map(({ id }) => id)).toEqual([created.body.id]);
  });

  it("keeps a single default template when one becomes the default", async () => {
    const created = await create({
      name: "Autre modèle",
      body: "Battue le {date}.",
    });

    const updated = await api(
      recordsPath("message_templates", created.body.id),
      { method: "PATCH", token, body: { is_default: true } },
    );

    expect(updated.status).toBe(200);
    expect((await defaults()).map(({ id }) => id)).toEqual([created.body.id]);
  });
});

describeOrganizerOnlyAccess(
  "message_templates",
  async () => ({ name: "Relance", body: "Rappel : battue le {date}." }),
  async () => ({ body: "Rappel : battue le {date} à {heure}." }),
);
