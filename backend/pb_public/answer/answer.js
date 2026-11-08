// Members' answer page (index.html, served for /r/{token}): shows the hunt
// and records the member's answer through the public routes
// /api/diane/r/{token} (pb_hooks/web-answers.pb.js). Texts from the server
// are always set as text (textContent), never as HTML. No cookie, no
// storage, nothing sent to another site. Started by main.js; tested in
// jsdom by tests/unit/answer-page.test.ts.

/** Answer link tokens: 43 random alphanumeric characters (32 to 64 accepted). */
const TOKEN_PATTERN = /^[A-Za-z0-9]{32,64}$/;

/** Slow networks (rural areas): give up after this delay. */
const TIMEOUT_MS = 15000;

/**
 * @typedef {object} AnswerView What GET /api/diane/r/{token} returns.
 * @property {{ date_label: string, time_label: string, cancelled: boolean }} hunt
 * @property {string} deadline_label e.g. "samedi 12 novembre à 20h00", or "".
 * @property {string} participation pending | present | waiting_list | absent
 * @property {boolean} can_answer
 * @property {{ code: string, message: string } | null} refusal
 */

/**
 * @typedef {object} Environment
 * @property {Document} document
 * @property {{ pathname: string }} location
 * @property {(url: string, init?: RequestInit) => Promise<Response>} fetch
 */

/**
 * Token of the page URL, `/r/{token}`; null when missing or malformed.
 *
 * @param {string} pathname
 * @returns {string | null}
 */
export function tokenFromPath(pathname) {
  const match = /^\/r\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] && TOKEN_PATTERN.test(match[1]) ? match[1] : null;
}

/** @param {string} text */
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** @param {string} participation */
function currentAnswerText(participation) {
  switch (participation) {
    case "present":
      return "Votre réponse : je viens";
    case "waiting_list":
      // Not "je viens": a member coming back must not turn up.
      return "Vous êtes sur liste d'attente (pas encore inscrit). Si une place se libère, l'organisateur pourra vous ajouter aux participants.";
    case "absent":
      return "Votre réponse : je ne viens pas";
    default:
      return "Vous n'avez pas encore répondu.";
  }
}

/** @param {AnswerView} view */
function confirmationText(view) {
  const hunt = `la battue du ${view.hunt.date_label}`;
  const change = view.deadline_label
    ? ` Vous pouvez changer d'avis jusqu'au ${view.deadline_label}.`
    : "";
  switch (view.participation) {
    case "present":
      return `C'est noté : vous venez à ${hunt}. Merci !${change}`;
    case "waiting_list":
      return `C'est noté. La battue est complète : vous êtes sur liste d'attente pour ${hunt}.${change}`;
    default:
      return `C'est noté : vous ne venez pas à ${hunt}.${change}`;
  }
}

/**
 * Why the member cannot answer, in plain words.
 *
 * @param {AnswerView} view
 */
function refusalText(view) {
  if (view.hunt.cancelled || view.refusal?.code === "hunt_cancelled") {
    return "Cette battue est annulée.";
  }
  if (view.refusal?.code === "hunt_closed") {
    return "Cette battue est clôturée : les réponses ne sont plus possibles.";
  }
  const when = view.deadline_label ? ` (${view.deadline_label})` : "";
  return `La date limite de réponse est passée${when}. Pour répondre ou changer votre réponse, contactez l'organisateur.`;
}

/**
 * Starts the page: loads the hunt and wires the buttons. Resolves once the
 * first load is shown.
 *
 * @param {Environment} env
 */
export async function start({ document, location, fetch }) {
  /** @param {string} id */
  const $ = (id) => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`#${id} missing`);
    return element;
  };
  const buttons = {
    yes: /** @type {HTMLButtonElement} */ ($("answer-yes")),
    no: /** @type {HTMLButtonElement} */ ($("answer-no")),
  };
  const status = $("status");
  const sendRetry = $("send-retry");
  const token = tokenFromPath(location.pathname);
  /** @type {"yes" | "no" | null} */
  let lastAnswer = null;

  /** Set by a user's retry: the button that had the focus disappears. */
  let focusNextTitle = false;

  /** @param {"loading" | "error" | "hunt"} section */
  function show(section) {
    for (const id of ["loading", "error", "hunt"]) {
      $(id).hidden = id !== section;
    }
    if (focusNextTitle && section !== "loading") {
      focusNextTitle = false;
      $(section === "error" ? "error-title" : "hunt-title").focus();
    }
  }

  /**
   * @param {string} title
   * @param {string} detail
   * @param {boolean} canRetry
   */
  function showError(title, detail, canRetry) {
    $("error-title").textContent = title;
    $("error-detail").textContent = detail;
    $("retry").hidden = !canRetry;
    show("error");
  }

  function showInvalidLink() {
    showError(
      "Ce lien n'est pas valide.",
      "Vérifiez que vous avez ouvert le lien complet reçu par SMS ou par e-mail. Vous pouvez aussi répondre par SMS ou contacter l'organisateur.",
      false,
    );
  }

  function showUnreachable() {
    showError(
      "Impossible de joindre le serveur.",
      "Vérifiez votre connexion Internet, puis appuyez sur «\u00a0Réessayer\u00a0».",
      true,
    );
  }

  /**
   * @param {string} text
   * @param {"" | "is-waiting" | "is-error"} [kind]
   */
  function setStatus(text, kind = "") {
    status.className = kind ? `status ${kind}` : "status";
    status.textContent = text;
    // Below the buttons: may be off screen on a small phone. Missing in
    // old browsers (and jsdom).
    status.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }

  /** @param {AnswerView} view */
  function render(view) {
    const date = capitalize(view.hunt.date_label);
    document.title = `Battue du ${date}`;
    $("hunt-date").textContent = date;
    $("hunt-time").textContent = view.hunt.time_label;
    // A cancelled hunt: the banner (above the date) says it all.
    $("hunt-time-line").hidden = view.hunt.cancelled;
    $("current").hidden = view.hunt.cancelled;

    const notice = $("notice");
    notice.hidden = view.can_answer;
    notice.textContent = view.can_answer ? "" : refusalText(view);

    const deadline = $("deadline");
    deadline.hidden = !view.can_answer || !view.deadline_label;
    deadline.textContent = `Répondez avant le ${view.deadline_label}.`;

    $("current").textContent = currentAnswerText(view.participation);
    $("answers").hidden = !view.can_answer;
    // Only a confirmed place checks "Je viens" (not the waiting list).
    const answer =
      view.participation === "absent"
        ? "no"
        : view.participation === "present"
          ? "yes"
          : null;
    buttons.yes.setAttribute("aria-pressed", String(answer === "yes"));
    buttons.no.setAttribute("aria-pressed", String(answer === "no"));
    show("hunt");
  }

  /**
   * Calls the answer route; null when the server cannot be reached
   * (network error, timeout, 5xx, 429).
   *
   * @param {RequestInit} [init]
   * @returns {Promise<{ status: number, body: any } | null>}
   */
  async function call(init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`/api/diane/r/${token}`, {
        ...init,
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (response.status >= 500 || response.status === 429) return null;
      const text = await response.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
      return { status: response.status, body };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** @returns {Promise<boolean>} whether the hunt is shown. */
  async function load() {
    show("loading");
    const result = await call();
    if (!result) {
      showUnreachable();
      return false;
    }
    if (result.status !== 200) {
      showInvalidLink();
      return false;
    }
    render(result.body);
    return true;
  }

  /** @param {boolean} sending */
  function setSending(sending) {
    buttons.yes.disabled = sending;
    buttons.no.disabled = sending;
    sendRetry.hidden = true;
  }

  /** @param {"yes" | "no"} answer */
  async function send(answer) {
    lastAnswer = answer;
    setSending(true);
    setStatus("Envoi en cours…");
    const result = await call({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });
    setSending(false);
    if (!result) {
      setStatus(
        "Votre réponse n'a pas pu être envoyée : le serveur est injoignable. Vérifiez votre connexion Internet, puis appuyez sur «\u00a0Réessayer\u00a0».",
        "is-error",
      );
      sendRetry.hidden = false;
      return;
    }
    if (result.status === 200) {
      render(result.body);
      setStatus(
        confirmationText(result.body),
        result.body.participation === "waiting_list" ? "is-waiting" : "",
      );
      return;
    }
    if (result.status === 404) {
      showInvalidLink();
      return;
    }
    // 409: deadline passed or hunt cancelled meanwhile; show the new state.
    if (await load()) {
      setStatus("Votre réponse n'a pas été enregistrée.", "is-error");
    }
  }

  buttons.yes.addEventListener("click", () => send("yes"));
  buttons.no.addEventListener("click", () => send("no"));
  sendRetry.addEventListener("click", () => {
    if (lastAnswer) send(lastAnswer);
  });
  $("retry").addEventListener("click", () => {
    focusNextTitle = true;
    load();
  });

  if (!token) {
    showInvalidLink();
    return;
  }
  await load();
}
