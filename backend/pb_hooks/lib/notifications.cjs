// Short messages sent to members besides the invitation: the confirmation
// of an SMS reply, the reminder before the deadline and the cancellation
// notice, and when the reminder is due. Every SMS is GSM-7 and fits a
// single segment for every date (tested).
// Pure CommonJS: loaded by hooks with
// require(`${__hooks}/lib/notifications.cjs`) and by Vitest with
// createRequire.

const { parseUtcDateTime } = require("./paris-time.cjs");
const {
  formatFrenchDay,
  formatFrenchTime,
  formatFrenchDeadline,
} = require("./message-template.cjs");
const { toGsm7 } = require("./sms-encoding.cjs");
const { channelsToResend } = require("./invitations.cjs");

/** The reminder is sent this long before the response deadline. */
const REMINDER_BEFORE_DEADLINE_MS = 24 * 60 * 60 * 1000;

/**
 * A reminder or cancellation notice is attempted at most this many times
 * per channel (automatic retries of the reminder cron, repeated calls of
 * the cancel route): a member never gets a flood of messages.
 */
const MAX_NOTICE_ATTEMPTS = 3;

/**
 * @typedef {object} HuntFields
 * @property {string} date              YYYY-MM-DD (Paris).
 * @property {string} meeting_time      HH:MM (Paris).
 * @property {string} response_deadline PocketBase UTC datetime, or "".
 */

/** @param {HuntFields} hunt */
function deadlineLabel(hunt) {
  const deadline = parseUtcDateTime(hunt.response_deadline);
  return deadline ? formatFrenchDeadline(deadline) : "";
}

/**
 * Confirmation SMS of a recognized SMS reply, repeating how it was
 * understood (CLAUDE.md), so that the member can correct a mistake.
 *
 * @param {"present" | "absent" | "waiting_list" | "cancelled"} outcome
 * @param {HuntFields} hunt
 * @returns {string} GSM-7.
 */
function confirmationSms(outcome, hunt) {
  const day = formatFrenchDay(hunt.date);
  if (outcome === "cancelled") {
    return toGsm7(`La battue du ${day} est annulée.`);
  }
  const recorded = {
    present: `Présence OUI enregistrée pour la battue du ${day}.`,
    absent: `Absence enregistrée pour la battue du ${day}.`,
    waiting_list: `Vous êtes sur liste d'attente pour la battue du ${day}.`,
  }[outcome];
  const dayOfMonth = Number(hunt.date.slice(8, 10));
  const change = `Pour changer, renvoyez OUI ${dayOfMonth} ou NON ${dayOfMonth}`;
  const limit = deadlineLabel(hunt);
  return toGsm7(
    limit
      ? `${recorded} ${change} avant le ${limit}.`
      : `${recorded} ${change}.`,
  );
}

/**
 * Reminder to a member who has not answered yet. The SMS gives the day to
 * reply with (always unambiguous) and no link, to fit one SMS; the e-mail
 * gives the link.
 *
 * @param {HuntFields} hunt
 * @param {string} link The member's answer link.
 */
function reminderMessages(hunt, link) {
  const day = formatFrenchDay(hunt.date);
  const time = formatFrenchTime(hunt.meeting_time);
  const dayOfMonth = Number(hunt.date.slice(8, 10));
  const limit = deadlineLabel(hunt);
  return {
    sms: toGsm7(
      `Rappel : battue du ${day} à ${time}. Vous n'avez pas encore répondu. Répondez par SMS OUI ${dayOfMonth} ou NON ${dayOfMonth} avant le ${limit}.`,
    ),
    email: {
      subject: `Rappel : battue du ${day}`,
      text:
        `Rappel : battue du ${day} à ${time}.\n` +
        `Vous n'avez pas encore répondu. Répondez ici avant le ${limit} :\n` +
        link,
    },
  };
}

/**
 * Notice of a cancelled hunt.
 *
 * @param {HuntFields} hunt
 */
function cancellationMessages(hunt) {
  const day = formatFrenchDay(hunt.date);
  const text = `La battue du ${day} à ${formatFrenchTime(hunt.meeting_time)} est annulée.`;
  return {
    sms: toGsm7(text),
    email: { subject: `Battue du ${day} annulée`, text },
  };
}

/**
 * Whether the reminder of `hunt` is due at `now`: invitations sent (not
 * cancelled or closed), a deadline, no reminder yet, from 24 hours before
 * the deadline until the deadline, and only when the invitations were sent
 * before that (a member invited less than 24 hours before the deadline just
 * got the invitation).
 *
 * @param {HuntFields & { status: string, invitations_sent_at: string, reminder_sent_at: string }} hunt
 * @param {Date} now
 */
function reminderDue(hunt, now) {
  if (hunt.status !== "invitations_sent" || hunt.reminder_sent_at) {
    return false;
  }
  const deadline = parseUtcDateTime(hunt.response_deadline);
  const sentAt = parseUtcDateTime(hunt.invitations_sent_at);
  if (!deadline || !sentAt) return false;
  const remindAt = deadline.getTime() - REMINDER_BEFORE_DEADLINE_MS;
  return (
    sentAt.getTime() < remindAt &&
    now.getTime() >= remindAt &&
    now.getTime() < deadline.getTime()
  );
}

/**
 * @typedef {object} NoticeState Reminder or cancellation notice of an
 *   invitation, per channel.
 * @property {string} sms_status
 * @property {string} email_status
 * @property {number} sms_attempts
 * @property {number} email_attempts
 * @property {string} updated
 */

/**
 * Channels of a notice to send (or send again): like channelsToResend
 * (failed, not sent, interrupted `sending`, never sent when `huntSent`),
 * but only while attempted less than MAX_NOTICE_ATTEMPTS times.
 *
 * @param {NoticeState} notice
 * @param {{ huntSent: boolean, bootedAt: Date | null, now: Date }} context
 * @returns {{ sms: boolean, email: boolean }}
 */
function noticeChannelsToSend(notice, context) {
  const channels = channelsToResend(notice, context);
  return {
    sms: channels.sms && notice.sms_attempts < MAX_NOTICE_ATTEMPTS,
    email: channels.email && notice.email_attempts < MAX_NOTICE_ATTEMPTS,
  };
}

/**
 * Status and attempt count to record after sending a notice channel: a
 * message not attempted (`not_sent`: gateway already unreachable during
 * the run) or skipped does not count as an attempt.
 *
 * @param {{ status: string, kind: string }} outcome Result of deliver().
 * @param {number} attempts Attempts before this one.
 * @returns {{ status: string, attempts: number }}
 */
function noticeRecord(outcome, attempts) {
  if (outcome.status === "skipped" || outcome.kind === "not_attempted") {
    return { status: outcome.status, attempts };
  }
  return { status: outcome.status, attempts: attempts + 1 };
}

/**
 * Order in which claimed notices are sent: least attempted first, in a
 * random order otherwise, so that a slow or unreachable gateway (the rest
 * of a sending is cut off after it) never keeps hitting the same member
 * first while the others wait.
 *
 * @template {{ attempts: number }} T
 * @param {T[]} items
 * @returns {T[]} A new array.
 */
function sendingOrder(items) {
  return items
    .map((item) => ({ item, rank: Math.random() }))
    .sort((a, b) => a.item.attempts - b.item.attempts || a.rank - b.rank)
    .map(({ item }) => item);
}

module.exports = {
  REMINDER_BEFORE_DEADLINE_MS,
  MAX_NOTICE_ATTEMPTS,
  noticeChannelsToSend,
  noticeRecord,
  sendingOrder,
  confirmationSms,
  reminderMessages,
  cancellationMessages,
  reminderDue,
};
