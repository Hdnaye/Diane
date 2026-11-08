// Behavior of the members' answer page (pb_public/answer/): the real
// index.html and answer.js in jsdom, with a fake fetch.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { BACKEND_DIR } from "../../scripts/paths.js";
import { start, tokenFromPath } from "../../pb_public/answer/answer.js";

const PAGE_DIR = path.join(BACKEND_DIR, "pb_public", "answer");
const TOKEN = "Ab3".repeat(14) + "x"; // 43 characters, like a real token

/** GET /api/diane/r/{token} of an open hunt nobody answered yet. */
function view(fields: Record<string, unknown> = {}) {
  return {
    hunt: {
      date: "2112-11-14",
      date_label: "lundi 14 novembre",
      meeting_time: "08:00",
      time_label: "8h00",
      cancelled: false,
    },
    deadline: "2112-11-12 19:00:00.000Z",
    deadline_label: "samedi 12 novembre à 20h00",
    participation: "pending",
    answer: null,
    can_answer: true,
    refusal: null,
    ...fields,
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type Reply = Response | Error;
type FetchCall = { url: string; init: RequestInit };

/** Fake fetch answering with `replies` in order. */
function fakeFetch(...replies: Reply[]) {
  const calls: FetchCall[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (!reply) throw new Error(`Unexpected request ${url}`);
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return { fetch, calls };
}

async function openPage(
  fetch: (url: string, init?: RequestInit) => Promise<Response>,
  pathname = `/r/${TOKEN}`,
) {
  const html = await readFile(path.join(PAGE_DIR, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: `https://diane.example.org${pathname}` });
  const { document } = dom.window;
  await start({ document, location: dom.window.location, fetch });
  const $ = (id: string) => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`#${id} not found`);
    return element;
  };
  const visibleText = () => {
    const parts: string[] = [];
    const walk = (element: Element) => {
      if (element.closest("[hidden]") || element.tagName === "NOSCRIPT")
        return;
      for (const child of element.childNodes) {
        if (child.nodeType === 3) parts.push(child.textContent ?? "");
        else if (child.nodeType === 1) walk(child as Element);
      }
    };
    walk(document.body);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };
  const isShown = (id: string) => !$(id).closest("[hidden]");
  return { document, $, visibleText, isShown };
}

/** Waits until `check` stops throwing (async click handlers). */
async function waitFor(check: () => void) {
  const deadline = Date.now() + 2000;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

describe("answer page", () => {
  describe("tokenFromPath", () => {
    it.each([
      [`/r/${TOKEN}`, TOKEN],
      [`/r/${TOKEN}/`, TOKEN],
      ["/r/not-a-token", null],
      ["/r/abc", null],
      ["/r/", null],
      [`/answer/${TOKEN}`, null],
    ])("reads %s", (pathname, expected) => {
      expect(tokenFromPath(pathname)).toBe(expected);
    });
  });

  it("shows the hunt, the deadline, the current answer and two buttons", async () => {
    const { fetch, calls } = fakeFetch(json(200, view()));

    const page = await openPage(fetch);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`/api/diane/r/${TOKEN}`);
    expect(calls[0]?.init.credentials).toBe("omit");
    expect(calls[0]?.init.referrerPolicy).toBe("no-referrer");
    expect(page.$("hunt-date").textContent).toBe("Lundi 14 novembre");
    expect(page.$("hunt-time").textContent).toBe("8h00");
    expect(page.visibleText()).toContain(
      "Répondez avant le samedi 12 novembre à 20h00",
    );
    expect(page.visibleText()).toContain("Vous n'avez pas encore répondu");
    expect(page.isShown("answer-yes")).toBe(true);
    expect(page.isShown("answer-no")).toBe(true);
    expect(page.$("answer-yes").textContent).toBe("Je viens");
    expect(page.$("answer-no").textContent).toBe("Je ne viens pas");
    expect(page.$("answer-yes").getAttribute("aria-pressed")).toBe("false");
    expect(page.isShown("loading")).toBe(false);
    expect(page.document.title).toContain("Lundi 14 novembre");
  });

  it("records a yes and confirms it", async () => {
    const { fetch, calls } = fakeFetch(
      json(200, view()),
      json(200, view({ participation: "present", answer: "yes" })),
    );
    const page = await openPage(fetch);

    (page.$("answer-yes") as HTMLButtonElement).click();

    await waitFor(() =>
      expect(page.$("status").textContent).toContain(
        "C'est noté : vous venez à la battue du lundi 14 novembre.",
      ),
    );
    expect(calls[1]?.url).toBe(`/api/diane/r/${TOKEN}`);
    expect(calls[1]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[1]?.init.body))).toStrictEqual({
      answer: "yes",
    });
    expect(page.$("status").getAttribute("aria-live")).toBe("polite");
    expect(page.$("answer-yes").getAttribute("aria-pressed")).toBe("true");
    expect(page.$("answer-no").getAttribute("aria-pressed")).toBe("false");
    expect(page.visibleText()).toContain("Votre réponse : je viens");
  });

  it("tells a yes that it is on the waiting list", async () => {
    const { fetch } = fakeFetch(
      json(200, view()),
      json(200, view({ participation: "waiting_list", answer: "yes" })),
    );
    const page = await openPage(fetch);

    (page.$("answer-yes") as HTMLButtonElement).click();

    await waitFor(() =>
      expect(page.$("status").textContent).toContain("liste d'attente"),
    );
    expect(page.$("status").textContent).toContain("La battue est complète");
    expect(page.visibleText()).toContain(
      "Votre réponse : je viens (liste d'attente)",
    );
  });

  it("records a no and confirms it", async () => {
    const { fetch, calls } = fakeFetch(
      json(200, view({ participation: "present", answer: "yes" })),
      json(200, view({ participation: "absent", answer: "no" })),
    );
    const page = await openPage(fetch);
    expect(page.visibleText()).toContain("Votre réponse : je viens");

    (page.$("answer-no") as HTMLButtonElement).click();

    await waitFor(() =>
      expect(page.$("status").textContent).toContain(
        "C'est noté : vous ne venez pas à la battue du lundi 14 novembre.",
      ),
    );
    expect(JSON.parse(String(calls[1]?.init.body))).toStrictEqual({
      answer: "no",
    });
    expect(page.visibleText()).toContain("Votre réponse : je ne viens pas");
  });

  it("tells when the deadline has passed, without buttons", async () => {
    const { fetch } = fakeFetch(
      json(
        200,
        view({
          participation: "absent",
          answer: "no",
          can_answer: false,
          refusal: {
            code: "deadline_passed",
            message: "La date limite de réponse est passée.",
          },
        }),
      ),
    );

    const page = await openPage(fetch);

    expect(page.visibleText()).toContain(
      "La date limite de réponse est passée (samedi 12 novembre à 20h00).",
    );
    expect(page.visibleText()).toContain("contactez l'organisateur");
    expect(page.visibleText()).toContain("Votre réponse : je ne viens pas");
    expect(page.isShown("answer-yes")).toBe(false);
    expect(page.isShown("answer-no")).toBe(false);
  });

  it("tells when the hunt is cancelled, without buttons", async () => {
    const { fetch } = fakeFetch(
      json(
        200,
        view({
          hunt: { ...view().hunt, cancelled: true },
          can_answer: false,
          refusal: { code: "hunt_cancelled", message: "La battue est annulée." },
        }),
      ),
    );

    const page = await openPage(fetch);

    expect(page.visibleText()).toContain("Cette battue est annulée.");
    expect(page.isShown("answer-yes")).toBe(false);
    expect(page.visibleText()).not.toContain("Répondez avant");
  });

  it("tells when the link is unknown", async () => {
    const { fetch } = fakeFetch(json(404, { status: 404, data: {} }));

    const page = await openPage(fetch);

    expect(page.visibleText()).toContain("Ce lien n'est pas valide");
    expect(page.isShown("retry")).toBe(false);
    expect(page.isShown("hunt")).toBe(false);
  });

  it("tells when the link is malformed, without calling the server", async () => {
    const { fetch } = fakeFetch();

    const page = await openPage(fetch, "/r/not-a-token");

    expect(fetch).not.toHaveBeenCalled();
    expect(page.visibleText()).toContain("Ce lien n'est pas valide");
  });

  it.each([
    ["unreachable", new TypeError("Failed to fetch")],
    ["in error", json(500, { status: 500 })],
    ["throttling", json(429, { status: 429 })],
  ])(
    "offers to retry when the server is %s",
    async (_label, failure: Reply) => {
      const { fetch } = fakeFetch(failure, json(200, view()));

      const page = await openPage(fetch);

      expect(page.visibleText()).toContain("Impossible de joindre le serveur");
      expect(page.isShown("retry")).toBe(true);
      expect(page.$("retry").textContent).toBe("Réessayer");

      (page.$("retry") as HTMLButtonElement).click();

      await waitFor(() => expect(page.isShown("answer-yes")).toBe(true));
      expect(page.isShown("error")).toBe(false);
      expect(page.$("hunt-date").textContent).toBe("Lundi 14 novembre");
    },
  );

  it("offers to send the answer again when the server is unreachable", async () => {
    const { fetch, calls } = fakeFetch(
      json(200, view()),
      new TypeError("Failed to fetch"),
      json(200, view({ participation: "present", answer: "yes" })),
    );
    const page = await openPage(fetch);

    (page.$("answer-yes") as HTMLButtonElement).click();

    await waitFor(() =>
      expect(page.$("status").textContent).toContain(
        "Votre réponse n'a pas pu être envoyée",
      ),
    );
    expect(page.isShown("send-retry")).toBe(true);
    expect(page.$("send-retry").textContent).toBe("Réessayer");

    (page.$("send-retry") as HTMLButtonElement).click();

    await waitFor(() =>
      expect(page.$("status").textContent).toContain("vous venez"),
    );
    expect(JSON.parse(String(calls[2]?.init.body))).toStrictEqual({
      answer: "yes",
    });
    expect(page.isShown("send-retry")).toBe(false);
  });

  it("shows the refusal when the deadline passed meanwhile", async () => {
    const refusal = {
      code: "deadline_passed",
      message: "La date limite de réponse est passée.",
    };
    const { fetch } = fakeFetch(
      json(200, view()),
      json(409, {
        status: 409,
        message: refusal.message,
        data: { answer: { code: "deadline_passed", message: refusal.message } },
      }),
      json(200, view({ can_answer: false, refusal })),
    );
    const page = await openPage(fetch);

    (page.$("answer-yes") as HTMLButtonElement).click();

    await waitFor(() => expect(page.isShown("answer-yes")).toBe(false));
    expect(page.visibleText()).toContain(
      "La date limite de réponse est passée",
    );
    expect(page.$("status").textContent).toContain(
      "Votre réponse n'a pas été enregistrée",
    );
  });

  it("disables the buttons while sending", async () => {
    let release: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => (release = resolve));
    const replies = [
      Promise.resolve(json(200, view())),
      pending,
    ];
    const page = await openPage(() => replies.shift() as Promise<Response>);

    (page.$("answer-yes") as HTMLButtonElement).click();

    await waitFor(() =>
      expect((page.$("answer-no") as HTMLButtonElement).disabled).toBe(true),
    );
    expect(page.$("status").textContent).toContain("Envoi en cours");
    release(json(200, view({ participation: "present", answer: "yes" })));
    await waitFor(() =>
      expect((page.$("answer-no") as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("shows server texts as text, never as HTML", async () => {
    const { fetch } = fakeFetch(
      json(
        200,
        view({
          hunt: { ...view().hunt, date_label: '<img src="x" id="injected">' },
        }),
      ),
    );

    const page = await openPage(fetch);

    expect(page.document.getElementById("injected")).toBeNull();
    expect(page.$("hunt-date").textContent).toContain("<img");
  });
});
