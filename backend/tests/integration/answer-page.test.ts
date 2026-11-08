// The members' answer page, served by PocketBase for /r/{token}
// (pb_public/answer/, pb_hooks/answer-page.pb.js), with restrictive
// security headers, and working end to end against the answer routes.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BACKEND_DIR } from "../../scripts/paths.js";
import { start } from "../../pb_public/answer/answer.js";
import { huntDays, phoneNumbers, recordsPath, uniqueEmail } from "./api.js";
import { startTestInstance, type TestInstance } from "./instance.js";

const nextPhone = phoneNumbers(46);
const nextDay = huntDays(2120);
const PAGE_DIR = path.join(BACKEND_DIR, "pb_public", "answer");
const TOKEN = "Qw9".repeat(14) + "z";

describe("answer page", () => {
  let pb: TestInstance;

  beforeAll(async () => {
    pb = await startTestInstance();
  });

  afterAll(async () => {
    await pb?.stop();
  });

  const get = (pathname: string) => fetch(`${pb.process.url}${pathname}`);

  function expectSafeHeaders(response: Response) {
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  }

  describe("/r/{token}", () => {
    it("serves the same page whatever the token", async () => {
      const html = await readFile(path.join(PAGE_DIR, "index.html"), "utf8");

      const first = await get(`/r/${TOKEN}`);
      const second = await get(`/r/${"B".repeat(43)}`);
      const invalid = await get("/r/not-a-token");

      for (const response of [first, second, invalid]) {
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toMatch(/^text\/html/);
        expect(await response.text()).toBe(html);
      }
    });

    it("sends restrictive security headers", async () => {
      const response = await get(`/r/${TOKEN}`);

      expectSafeHeaders(response);
      const csp = response.headers.get("content-security-policy") ?? "";
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).not.toContain("unsafe-inline");
      expect(csp).not.toContain("unsafe-eval");
      expect(csp).not.toMatch(/https?:|\*/);
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      const cache = response.headers.get("cache-control") ?? "";
      expect(cache).toMatch(/no-cache|no-store/);
      expect(cache).not.toContain("public");
      expect(response.headers.get("set-cookie")).toBeNull();
    });

    it.each([
      ["answer.css", /^text\/css/],
      ["answer.js", /^text\/javascript/],
      ["main.js", /^text\/javascript/],
      ["fonts/AtkinsonHyperlegible-Regular.ttf", /^font\/ttf/],
      ["fonts/AtkinsonHyperlegible-Bold.ttf", /^font\/ttf/],
    ])("serves /answer/%s", async (file, type) => {
      const response = await get(`/answer/${file}`);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(type);
      expectSafeHeaders(response);
      expect(response.headers.get("cache-control") ?? "").not.toContain(
        "public",
      );
    });
  });

  describe("/api/diane/r/{token}", () => {
    it("is never cached", async () => {
      const response = await get(`/api/diane/r/${TOKEN}`);

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expectSafeHeaders(response);
    });
  });

  describe("end to end", () => {
    async function create(collection: string, body: Record<string, unknown>) {
      const response = await pb.api(recordsPath(collection), {
        method: "POST",
        token: pb.organizerToken,
        body,
      });
      if (response.status !== 200) {
        throw new Error(
          `Setup failed: HTTP ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
      return response.body;
    }

    /** Opens the page served for `token` in jsdom, calling the instance. */
    async function openPage(token: string) {
      const pathname = `/r/${token}`;
      const html = await (await get(pathname)).text();
      const dom = new JSDOM(html, { url: `${pb.process.url}${pathname}` });
      const { document } = dom.window;
      await start({
        document,
        location: dom.window.location,
        fetch: (url: string, init?: RequestInit) =>
          fetch(new URL(url, pb.process.url), init),
      });
      const text = (id: string) => document.getElementById(id)?.textContent;
      return { document, text };
    }

    it("shows the hunt, records the answer and shows it after a reload", async () => {
      const hunt = await create("hunts", {
        date: nextDay(),
        meeting_time: "07:30",
        response_deadline: "2119-12-01 19:00:00.000Z",
        status: "invitations_sent",
      });
      const member = await create("members", {
        name: "Lucien Garnier",
        phone: nextPhone(),
        email: uniqueEmail(),
      });
      const invitation = await create("invitations", {
        hunt: hunt.id,
        member: member.id,
      });

      const page = await openPage(invitation.token);
      expect(page.text("hunt-date")).toBe("Lundi 1er janvier");
      expect(page.text("hunt-time")).toBe("7h30");
      expect(page.text("current")).toContain("pas encore répondu");

      (page.document.getElementById("answer-yes") as HTMLElement).click();
      const deadline = Date.now() + 5000;
      while (!page.text("status")?.includes("C'est noté")) {
        if (Date.now() > deadline) throw new Error("No confirmation");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      expect(page.text("status")).toContain("vous venez");
      const record = await pb.api(recordsPath("invitations", invitation.id), {
        token: pb.organizerToken,
      });
      expect(record.body.participation).toBe("present");
      expect(record.body.answered_via).toBe("web");
      const reloaded = await openPage(invitation.token);
      expect(reloaded.text("current")).toBe("Votre réponse : je viens");
    });
  });
});
