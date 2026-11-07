// Renders invitation message templates (SMS and e-mail) with French dates.
// Variables: {date} ("samedi 14 novembre"), {heure} ("8h00"), {limite}
// (response deadline, "jeudi 12 novembre à 18h00"), {jour} (day of the
// month, for "OUI 14") and {lien} (the member's answer link).
// Pure CommonJS: loaded by hooks with
// require(`${__hooks}/lib/message-template.cjs`) and by Vitest with
// createRequire. Intl is not used: PocketBase's JSVM has no French locale.

const { utcToParis, parseUtcDateTime } = require("./paris-time.cjs");

const WEEKDAYS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/**
 * @param {string} day YYYY-MM-DD.
 * @returns {string} e.g. "samedi 14 novembre", "dimanche 1er novembre".
 */
function formatFrenchDay(day) {
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(date)),
  ).getUTCDay();
  const dayOfMonth = date === 1 ? "1er" : String(date);
  return `${WEEKDAYS[weekday]} ${dayOfMonth} ${MONTHS[Number(month) - 1]}`;
}

/**
 * @param {string} time HH:MM.
 * @returns {string} e.g. "8h00".
 */
function formatFrenchTime(time) {
  const [hours, minutes] = time.split(":");
  return `${Number(hours)}h${minutes}`;
}

/**
 * @param {Date} instant
 * @returns {string} Paris time, e.g. "jeudi 12 novembre à 18h00".
 */
function formatFrenchDeadline(instant) {
  const { day, time } = utcToParis(instant);
  return `${formatFrenchDay(day)} à ${formatFrenchTime(time)}`;
}

/**
 * @typedef {object} HuntFields
 * @property {string} date              YYYY-MM-DD (Paris).
 * @property {string} meeting_time      HH:MM (Paris).
 * @property {string} response_deadline PocketBase UTC datetime, or "".
 */

/**
 * Template variables of a hunt. Unknown values are empty.
 *
 * @param {HuntFields} hunt
 * @param {string} [link] The member's answer link.
 * @returns {Record<string, string>}
 */
function messageVariables(hunt, link = "") {
  const deadline = parseUtcDateTime(hunt.response_deadline);
  return {
    date: formatFrenchDay(hunt.date),
    heure: formatFrenchTime(hunt.meeting_time),
    limite: deadline ? formatFrenchDeadline(deadline) : "",
    jour: String(Number(hunt.date.slice(8, 10))),
    lien: link,
  };
}

/**
 * Replaces each {name} of `variables` in `body`. Unknown placeholders are
 * left as they are; substituted values are not scanned again.
 *
 * @param {string} body
 * @param {Record<string, string>} variables
 * @returns {string}
 */
function renderTemplate(body, variables) {
  return body.replace(/\{([a-z]+)\}/g, (placeholder, name) =>
    Object.prototype.hasOwnProperty.call(variables, name)
      ? String(variables[name])
      : placeholder,
  );
}

module.exports = {
  formatFrenchDay,
  formatFrenchTime,
  formatFrenchDeadline,
  messageVariables,
  renderTemplate,
};
