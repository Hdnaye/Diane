// Incoming SMS from the gateway (SMS Gateway for Android webhooks): reading
// the webhook, freshness of its signature, and which invitation a recognized
// reply applies to.
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/sms-inbound.cjs`)
// and by Vitest with createRequire.

const { normalizeFrenchPhone } = require("./phone.cjs");
const { parisToUtc } = require("./paris-time.cjs");
const { answerRefusal } = require("./invitations.cjs");

/**
 * A signed webhook older (or further in the future) than this is refused:
 * a captured request cannot be replayed later. The gateway signs each
 * attempt (retries included) with the time of that attempt.
 */
const SIGNATURE_MAX_AGE_S = 300;

/**
 * At most this many confirmation SMS to the same member per rolling hour:
 * an automatic answering machine replying "OUI" to each confirmation can
 * never start an endless exchange.
 */
const MAX_CONFIRMATIONS_PER_HOUR = 5;

/**
 * Whether the `X-Timestamp` header (Unix seconds) is within
 * SIGNATURE_MAX_AGE_S of `now`.
 *
 * @param {string} timestamp
 * @param {Date} now
 */
function timestampFresh(timestamp, now) {
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  return (
    Math.abs(now.getTime() / 1000 - Number(timestamp)) <= SIGNATURE_MAX_AGE_S
  );
}

/**
 * @typedef {object} WebhookEvent
 * @property {string} event     e.g. "sms:received".
 * @property {string} eventId   Id of the event, the same on every retry;
 *   "" when missing or unusable.
 * @property {string} sender    As sent by the gateway (not normalized).
 * @property {string} recipient The gateway's own number, "" when unknown.
 * @property {string} text      SMS body.
 */

/** @param {unknown} value */
const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads a webhook of SMS Gateway for Android:
 * `{ event, id, payload: { message, sender | phoneNumber, recipient } }`
 * (`phoneNumber`: older versions). Only `sms:received` needs a payload.
 *
 * @param {string} raw Request body.
 * @returns {WebhookEvent | null} null when malformed.
 */
function parseWebhookEvent(raw) {
  /** @type {unknown} */
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(body)) return null;
  const record = /** @type {Record<string, unknown>} */ (body);
  if (typeof record.event !== "string" || !record.event) return null;
  const eventId =
    typeof record.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(record.id)
      ? record.id
      : "";
  /** @type {WebhookEvent} */
  const event = {
    event: record.event,
    eventId,
    sender: "",
    recipient: "",
    text: "",
  };
  if (record.event !== "sms:received") return event;
  if (!isObject(record.payload)) return null;
  const payload = /** @type {Record<string, unknown>} */ (record.payload);
  const sender = payload.sender ?? payload.phoneNumber;
  if (typeof payload.message !== "string" || typeof sender !== "string") {
    return null;
  }
  event.sender = sender;
  event.recipient =
    typeof payload.recipient === "string" ? payload.recipient : "";
  event.text = payload.message;
  return event;
}

/**
 * Whether `sender` is one of the gateway's own numbers (an SMS sent to
 * ourselves is never answered).
 *
 * @param {string} sender
 * @param {string[]} ownNumbers Raw numbers, "" ignored.
 */
function isOwnNumber(sender, ownNumbers) {
  const normalized = normalizeFrenchPhone(sender);
  if (!normalized) return false;
  return ownNumbers.some(
    (number) => number !== "" && normalizeFrenchPhone(number) === normalized,
  );
}

/**
 * @typedef {object} MemberInvitation
 * @property {string} id
 * @property {string} participation
 * @property {import("./invitations.cjs").Hunt} hunt
 */

/**
 * @typedef {{ action: "apply", invitationId: string, answer: "yes" | "no" }
 *   | { action: "cancelled", invitationId: string }
 *   | { action: "review", reason: string }} Resolution
 * review reasons: no_open_invitation, several_open_invitations, ambiguous,
 * unknown_day, ambiguous_day, deadline_passed, hunt_closed.
 */

/**
 * Which invitation of a member a recognized SMS reply applies to. Only the
 * invitations of hunts sent (not drafts) and not started yet count; an
 * invitation is open while the member may answer (answered or not).
 * - Without a day: the single open invitation; several or none → review,
 *   and also when another upcoming hunt (not cancelled) still waits for
 *   the member's answer, deadline passed (in doubt, to check: a late reply
 *   for tomorrow's hunt must not land on next week's).
 *   None open but a single upcoming hunt, cancelled → "cancelled".
 * - With a day: the hunt of that day of the month; none or several (months
 *   apart) → review; cancelled → "cancelled"; deadline passed or closed →
 *   review.
 *
 * @param {import("./sms-reply.cjs").SmsReply} reply
 * @param {MemberInvitation[]} invitations The member's invitations.
 * @param {Date} now
 * @returns {Resolution}
 */
function resolveSmsReply(reply, invitations, now) {
  const upcoming = invitations.filter(
    (invitation) =>
      invitation.hunt.status !== "draft" &&
      parisToUtc(invitation.hunt.date, invitation.hunt.meeting_time).getTime() >
        now.getTime(),
  );

  if (reply.day !== undefined) {
    const matches = upcoming.filter(
      (invitation) => Number(invitation.hunt.date.slice(8, 10)) === reply.day,
    );
    if (matches.length === 0)
      return { action: "review", reason: "unknown_day" };
    if (matches.length > 1)
      return { action: "review", reason: "ambiguous_day" };
    const match = /** @type {MemberInvitation} */ (matches[0]);
    if (match.hunt.status === "cancelled") {
      return { action: "cancelled", invitationId: match.id };
    }
    const refusal = answerRefusal(match.hunt, now);
    if (refusal) return { action: "review", reason: refusal.code };
    return { action: "apply", invitationId: match.id, answer: reply.answer };
  }

  const open = upcoming.filter(
    (invitation) => answerRefusal(invitation.hunt, now) === null,
  );
  if (open.length === 1) {
    const match = /** @type {MemberInvitation} */ (open[0]);
    const otherPending = upcoming.some(
      (invitation) =>
        invitation.id !== match.id &&
        invitation.participation === "pending" &&
        invitation.hunt.status !== "cancelled",
    );
    if (otherPending) return { action: "review", reason: "ambiguous" };
    return { action: "apply", invitationId: match.id, answer: reply.answer };
  }
  if (open.length > 1) {
    return { action: "review", reason: "several_open_invitations" };
  }
  const closed = upcoming.filter(
    (invitation) => invitation.hunt.status !== "cancelled",
  );
  if (closed.length > 0) {
    const passed = closed.some(
      (invitation) =>
        answerRefusal(invitation.hunt, now)?.code === "deadline_passed",
    );
    return {
      action: "review",
      reason: passed ? "deadline_passed" : "hunt_closed",
    };
  }
  if (upcoming.length === 1) {
    const match = /** @type {MemberInvitation} */ (upcoming[0]);
    return { action: "cancelled", invitationId: match.id };
  }
  return { action: "review", reason: "no_open_invitation" };
}

module.exports = {
  SIGNATURE_MAX_AGE_S,
  MAX_CONFIRMATIONS_PER_HOUR,
  timestampFresh,
  parseWebhookEvent,
  isOwnNumber,
  resolveSmsReply,
};
