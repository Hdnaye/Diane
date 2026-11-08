// Invitation rules: when invitations may be sent, until when a member may
// answer, what the public answer page shows (nothing personal), and the
// messages sent.
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/invitations.cjs`)
// and by Vitest with createRequire.

const {
  parisToUtc,
  utcToParis,
  parseUtcDateTime,
} = require("./paris-time.cjs");
const {
  formatFrenchDay,
  formatFrenchTime,
  formatFrenchDeadline,
  messageVariables,
  renderTemplate,
  renderSms,
} = require("./message-template.cjs");

/**
 * Default response deadline (CLAUDE.md), at a time easy to read in a
 * message: DEFAULT_DEADLINE_DAYS after the sending day at
 * DEFAULT_DEADLINE_TIME (Paris), or the day before the hunt at that time.
 */
const DEFAULT_DEADLINE_DAYS = 2;
const DEFAULT_DEADLINE_TIME = "20:00";
/**
 * A default deadline leaves at least this delay to answer after the sending
 * (user decision): otherwise the organizer sets the deadline.
 */
const MIN_DEFAULT_DEADLINE_DELAY_MS = 2 * 60 * 60 * 1000;

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
 * @param {string} day YYYY-MM-DD.
 * @param {number} days
 * @returns {string} YYYY-MM-DD, `days` later (or earlier when negative).
 */
function addDays(day, days) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(date) + days),
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Default response deadline of invitations to `hunt` sent at `now` (Paris
 * times):
 * - the sending day + 2 days at 20:00, if strictly before the hunt starts
 *   (sent on Sunday 11:00 -> Tuesday 20:00);
 * - else the day before the hunt at 20:00, if at least 2 hours ahead
 *   (MIN_DEFAULT_DEADLINE_DELAY_MS);
 * - else none (null): the organizer must set one.
 *
 * @param {{ date: string, meeting_time: string }} hunt
 * @param {Date} now
 * @returns {string | null} PocketBase UTC datetime.
 */
function defaultDeadline(hunt, now) {
  const start = parisToUtc(hunt.date, hunt.meeting_time).getTime();
  const dayPlus2 = parisToUtc(
    addDays(utcToParis(now).day, DEFAULT_DEADLINE_DAYS),
    DEFAULT_DEADLINE_TIME,
  );
  if (dayPlus2.getTime() < start) return toPocketBaseDate(dayPlus2);
  const dayBefore = parisToUtc(addDays(hunt.date, -1), DEFAULT_DEADLINE_TIME);
  if (
    dayBefore.getTime() - now.getTime() >= MIN_DEFAULT_DEADLINE_DELAY_MS &&
    dayBefore.getTime() < start
  ) {
    return toPocketBaseDate(dayBefore);
  }
  return null;
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
  const byDefault = defaultDeadline(hunt, now);
  if (byDefault === null) {
    return {
      ok: false,
      code: "deadline_missing",
      message:
        "La battue est trop proche pour une date limite par défaut (la veille à 20h00 est passée ou dans moins de 2 h) : fixez une date limite de réponse.",
    };
  }
  return { ok: true, deadline: byDefault };
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

/**
 * A channel left `sending` longer than this was abandoned (a sending request
 * takes seconds: one gateway timeout of 5 s at most, then a few hundred ms
 * per message): `resend-failed` takes it over.
 */
const STALE_SENDING_MS = 10 * 60 * 1000;

/**
 * Channels of a pending invitation that `resend-failed` sends: failed ones,
 * ones left `sending` by an interrupted request (older than the last
 * PocketBase start, or than STALE_SENDING_MS), and ones never sent
 * (empty status) once the hunt's invitations were sent.
 *
 * @param {{ sms_status: string, email_status: string, updated: string }} invitation
 * @param {{ huntSent: boolean, bootedAt: Date | null, now: Date }} context
 * @returns {{ sms: boolean, email: boolean }}
 */
function channelsToResend(invitation, { huntSent, bootedAt, now }) {
  const updated = parseUtcDateTime(invitation.updated);
  const abandoned =
    updated !== null &&
    ((bootedAt !== null && updated.getTime() < bootedAt.getTime()) ||
      now.getTime() - updated.getTime() >= STALE_SENDING_MS);
  /** @param {string} status */
  const resend = (status) =>
    status === "failed" ||
    (status === "sending" && abandoned) ||
    (status === "" && huntSent);
  return {
    sms: resend(invitation.sms_status),
    email: resend(invitation.email_status),
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
  defaultDeadline,
  answerLink,
  sendPlan,
  answerRefusal,
  isOpenInvitation,
  publicAnswerView,
  invitationMessages,
  STALE_SENDING_MS,
  MIN_DEFAULT_DEADLINE_DELAY_MS,
  channelsToResend,
  sendSummary,
};
