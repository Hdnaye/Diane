// Shared integration tests: a collection only an authenticated organizer
// can read or write (CLAUDE.md, "Accès organisateur (POC)").
import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  createOrganizer,
  recordsPath,
  superuserToken,
  type Organizer,
} from "./api.js";

/**
 * @param collection Collection name.
 * @param validBody  Returns the body of a new valid record (called once per
 *                   record, so that unique fields can differ).
 * @param validPatch Returns a valid update of such a record.
 */
export function describeOrganizerOnlyAccess(
  collection: string,
  validBody: () => Promise<Record<string, unknown>>,
  validPatch: () => Promise<Record<string, unknown>>,
) {
  describe(`${collection}: organizer-only access`, () => {
    let organizer: Organizer;
    /** Record created by a superuser, which anonymous requests must not reach. */
    let existingId: string;
    let existingBody: Record<string, unknown>;

    beforeAll(async () => {
      organizer = await createOrganizer();
      existingBody = await validBody();
      const created = await api(recordsPath(collection), {
        method: "POST",
        token: await superuserToken(),
        body: existingBody,
      });
      if (created.status !== 200) {
        throw new Error(
          `Setup failed: HTTP ${created.status} ${JSON.stringify(created.body)}`,
        );
      }
      existingId = created.body.id;
    });

    /**
     * Number of records with every field of `body` (bodies are unique: other
     * test files create records concurrently).
     */
    async function matching(body: Record<string, unknown>): Promise<number> {
      const filter = Object.entries(body)
        .map(([field, value]) => `${field}=${JSON.stringify(value)}`)
        .join(" && ");
      const list = await api(
        `${recordsPath(collection)}?perPage=1&filter=${encodeURIComponent(filter)}`,
        { token: await superuserToken() },
      );
      return list.body.totalItems;
    }

    // An explicit 401 rather than an empty list: the app must not believe
    // there is no data when its session is missing or expired.
    it.each([
      ["anonymous", undefined],
      ["invalid token", "not-a-valid-token"],
    ])("refuses %s list requests with a 401", async (_label, token) => {
      const response = await api(recordsPath(collection), { token });

      expect(response.status).toBe(401);
      expect(response.body.items).toBeUndefined();
    });

    // PocketBase finds the collection whatever the case, and decodes the
    // path: these spellings reach the same records.
    it.each([
      ["in upper case", () => recordsPath(collection.toUpperCase())],
      [
        "with an encoded letter",
        () =>
          recordsPath(
            `%${collection.charCodeAt(0).toString(16)}${collection.slice(1)}`,
          ),
      ],
      [
        "with an encoded records",
        () => `/api/collections/${collection}/re%63ords`,
      ],
    ])(
      "refuses requests naming the collection %s with a 401",
      async (_label, pathname) => {
        const listed = await api(pathname());
        const viewed = await api(`${pathname()}/${existingId}`);

        expect(listed.status).toBe(401);
        expect(viewed.status).toBe(401);
      },
    );

    it("refuses requests naming the collection by id with a 401", async () => {
      const info = await api(`/api/collections/${collection}`, {
        token: await superuserToken(),
      });

      const response = await api(recordsPath(info.body.id));

      expect(response.status).toBe(401);
    });

    it.each([
      ["anonymous", undefined],
      ["invalid token", "not-a-valid-token"],
    ])(
      "refuses %s view, update and delete with a 401",
      async (_label, token) => {
        const viewed = await api(recordsPath(collection, existingId), {
          token,
        });
        const updated = await api(recordsPath(collection, existingId), {
          method: "PATCH",
          token,
          body: await validPatch(),
        });
        const deleted = await api(recordsPath(collection, existingId), {
          method: "DELETE",
          token,
        });

        expect(viewed.status).toBe(401);
        expect(updated.status).toBe(401);
        expect(deleted.status).toBe(401);
        const check = await api(recordsPath(collection, existingId), {
          token: await superuserToken(),
        });
        expect(check.status).toBe(200);
      },
    );

    it("refuses anonymous creation", async () => {
      const body = await validBody();

      const response = await api(recordsPath(collection), {
        method: "POST",
        body,
      });

      expect(response.status).toBe(401);
      expect(await matching(body)).toBe(0);
      // The check itself finds records.
      expect(await matching(existingBody)).toBe(1);
    });

    it("lets an organizer create, list, view, update and delete", async () => {
      const { token } = organizer;

      const created = await api(recordsPath(collection), {
        method: "POST",
        token,
        body: await validBody(),
      });
      expect(created.status).toBe(200);
      const { id } = created.body;

      const list = await api(
        `${recordsPath(collection)}?filter=${encodeURIComponent(`id="${id}"`)}`,
        { token },
      );
      const viewed = await api(recordsPath(collection, id), { token });
      const updated = await api(recordsPath(collection, id), {
        method: "PATCH",
        token,
        body: await validPatch(),
      });
      const deleted = await api(recordsPath(collection, id), {
        method: "DELETE",
        token,
      });

      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(1);
      expect(viewed.status).toBe(200);
      expect(updated.status).toBe(200);
      expect(deleted.status).toBe(204);
    });
  });
}
