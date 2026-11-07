// Interprets a member's SMS reply to an invitation.
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/sms-reply.cjs`)
// and by Vitest with createRequire.

/**
 * @typedef {object} SmsReply
 * @property {"yes" | "no"} answer
 * @property {number} [day] Day of the month of the hunt, when several are open.
 */

const REPLY = /^(oui|non)\s*(\d{1,2})?$/;

/**
 * Parses `OUI` / `NON`, optionally followed by a day of the month
 * (`OUI 15`), ignoring case, accents and surrounding whitespace.
 *
 * @param {string} text Raw SMS body.
 * @returns {SmsReply | null} `null` when the reply is not recognized.
 */
function parseSmsReply(text) {
  if (typeof text !== "string") return null;

  const normalized = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  const match = REPLY.exec(normalized);
  if (!match) return null;

  /** @type {SmsReply} */
  const reply = { answer: match[1] === "oui" ? "yes" : "no" };
  if (match[2] !== undefined) {
    const day = Number(match[2]);
    if (day < 1 || day > 31) return null;
    reply.day = day;
  }
  return reply;
}

module.exports = { parseSmsReply };
