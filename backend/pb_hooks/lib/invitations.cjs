// Invitation rules: when invitations may be sent, until when a member may
// answer, what the public answer page shows (nothing personal), and the
// messages sent.
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/invitations.cjs`)
// and by Vitest with createRequire.

const { parisToUtc, parseUtcDateTime } = require("./paris-time.cjs");
const {
  formatFrenchDay,
  formatFrenchTime,
  formatFrenchDeadline,
  messageVariables,
  renderTemplate,
  renderSms,
} = require("./message-template.cjs");

/** Default response deadline after sending (CLAUDE.md: +48 h). */
const DEFAULT_DEADLINE_MS = 48 * 60 * 60 * 1000;

/**
 * @typedef {object} Hunt
 * @property {string} date              YYYY-MM-DD (Paris).
 * @property {string} meeting_time      HH:MM (Paris).
 * @property {string} response_deadline PocketBase UTC datetime, or "".
 * @property {string} status
 */

/**
 * @typedef {object} Refusal
 * @property {string} code    Stable identifier, e.g. "deadline_passed".
 * @property {string} message French, shown to the user.
 */

/**
 * @param {Date} date
 * @returns {string} e.g. "2026-11-12 17:00:00.000Z", as PocketBase writes it.
 */
function toPocketBaseDate(date) {
  return date.toISOString().replace("T", " ");
}

/**
 * Public answer link of an invitation, or null when the public URL is
 * missing or not an http(s) URL.
 *
 * @param {string} publicUrl e.g. "https://diane.example.org".
 * @param {string} token
 * @returns {string | null}
 */
function answerLink(publicUrl, token) {
  const base = publicUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(base)) return null;
  return `${base}/r/${token}`;
}

/**
 * Refusal common to sending and answering, or null.
 *
 * @param {Hunt} hunt
 * @returns {Refusal | null}
 */
function statusRefusal(hunt) {
  if (hunt.status === "cancelled") {
    return { code: "hunt_cancelled", message: "La battue est annulée." };
  }
  if (hunt.status === "closed") {
    return { code: "hunt_closed", message: "La battue est clôturée." };
  }
  return null;
}

/**
 * @typedef {{ ok: true, deadline: string | null }
 *   | { ok: false, code: string, message: string }} SendPlan
 * deadline: response deadline to set before sending (the default one), or
 * null to keep the hunt's.
 */

/**
 * Whether invitations to `hunt` may be sent at `now`.
 *
 * @param {Hunt} hunt
 * @param {Date} now
 * @returns {SendPlan}
 */
function sendPlan(hunt, now) {
  const refusal = statusRefusal(hunt);
  if (refusal) return { ok: false, ...refusal };
  const deadline = parseUtcDateTime(hunt.response_deadline);
  if (deadline) {
    if (deadline.getTime() <= now.getTime()) {
      return {
        ok: false,
        code: "deadline_passed",
        message: "La date limite de réponse est passée.",
      };
    }
    return { ok: true, deadline: null };
  }
  const byDefault = new Date(now.getTime() + DEFAULT_DEADLINE_MS);
  if (
    byDefault.getTime() >= parisToUtc(hunt.date, hunt.meeting_time).getTime()
  ) {
    return {
      ok: false,
      code: "deadline_missing",
      message:
        "La battue a lieu dans moins de 48 h : fixez une date limite de réponse.",
    };
  }
  return { ok: true, deadline: toPocketBaseDate(byDefault) };
}

/**
 * Why a member may no longer answer at `now`, or null. Without deadline, a
 * member may answer until the hunt starts.
 *
 * @param {Hunt} hunt
 * @param {Date} now
 * @returns {Refusal | null}
 */
function answerRefusal(hunt, now) {
  const refusal = statusRefusal(hunt);
  if (refusal) return refusal;
  const limit =
    parseUtcDateTime(hunt.response_deadline) ??
    parisToUtc(hunt.date, hunt.meeting_time);
  if (limit.getTime() <= now.getTime()) {
    return {
      code: "deadline_passed",
      message:
        "La date limite de réponse est passée : contactez l'organisateur pour modifier votre réponse.",
    };
  }
  return null;
}

/**
 * An invitation still waiting for an answer that the member may give.
 *
 * @param {{ participation: string }} invitation
 * @param {Hunt} hunt
 * @param {Date} now
 */
function isOpenInvitation(invitation, hunt, now) {
  return (
    invitation.participation === "pending" && answerRefusal(hunt, now) === null
  );
}

/** @type {Record<string, "yes" | "no" | null>} */
const ANSWERS = {
  pending: null,
  present: "yes",
  waiting_list: "yes",
  absent: "no",
};

/**
 * What the public answer page may show: the hunt, the deadline and the
 * member's own answer. No name, phone, e-mail or other member.
 *
 * @param {Hunt} hunt
 * @param {{ participation: string }} invitation
 * @param {Date} now
 */
function publicAnswerView(hunt, invitation, now) {
  const deadline = parseUtcDateTime(hunt.response_deadline);
  const refusal = answerRefusal(hunt, now);
  return {
    hunt: {
      date: hunt.date,
      date_label: formatFrenchDay(hunt.date),
      meeting_time: hunt.meeting_time,
      time_label: formatFrenchTime(hunt.meeting_time),
      cancelled: hunt.status === "cancelled",
    },
    deadline: deadline ? hunt.response_deadline : "",
    deadline_label: deadline ? formatFrenchDeadline(deadline) : "",
    participation: invitation.participation,
    answer: ANSWERS[invitation.participation] ?? null,
    can_answer: refusal === null,
    refusal,
  };
}

/**
 * SMS (GSM-7) and e-mail of an invitation.
 *
 * @param {object} input
 * @param {string} input.body     Template body.
 * @param {Hunt} input.hunt
 * @param {string} input.link     The member's answer link.
 * @param {boolean} input.several The member has several open invitations.
 */
function invitationMessages({ body, hunt, link, several }) {
  const variables = messageVariables(hunt, link, { several });
  return {
    sms: renderSms(body, variables),
    email: {
      subject: `Battue du ${variables.date}`,
      text: renderTemplate(body, variables),
    },
  };
}

/** @typedef {"sent" | "failed" | "skipped"} SendStatus */

/**
 * Recap of a sending: statuses counted per channel.
 *
 * @param {{ sms_status: string, email_status: string }[]} results
 */
function sendSummary(results) {
  /** @param {"sms_status" | "email_status"} field */
  const count = (field) => ({
    sent: results.filter((item) => item[field] === "sent").length,
    failed: results.filter((item) => item[field] === "failed").length,
    skipped: results.filter((item) => item[field] === "skipped").length,
  });
  return {
    invited: results.length,
    sms: count("sms_status"),
    email: count("email_status"),
  };
}

module.exports = {
  toPocketBaseDate,
  answerLink,
  sendPlan,
  answerRefusal,
  isOpenInvitation,
  publicAnswerView,
  invitationMessages,
  sendSummary,
};
