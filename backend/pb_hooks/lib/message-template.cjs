// Renders invitation message templates (SMS and e-mail) with French dates.
// Variables: {date} ("samedi 14 novembre"), {heure} ("8h00"), {limite}
// (response deadline, "jeudi 12 novembre à 18h00"), {jour} (day of the
// month, for "OUI 14") and {lien} (the member's answer link).
// Section: {#plusieurs}...{/plusieurs} is kept only when the member has
// several open invitations; a removed section filling whole lines removes
// those lines.
// SMS are rendered with renderSms(): characters outside of GSM-7 are
// transliterated ("août" becomes "aout"), so that an SMS does not switch to
// UCS-2 (70 characters per SMS instead of 160). E-mails keep the accents.
// Pure CommonJS: loaded by hooks with
// require(`${__hooks}/lib/message-template.cjs`) and by Vitest with
// createRequire. Intl is not used: PocketBase's JSVM has no French locale.

const { utcToParis, parseUtcDateTime } = require("./paris-time.cjs");
const { toGsm7 } = require("./sms-encoding.cjs");

/**
 * Body of the default template, seeded by a migration (same text, checked
 * by an integration test). Rendered as GSM-7, it fits 2 SMS for every date
 * (tested).
 */
const DEFAULT_TEMPLATE_BODY = [
  "Battue le {date} à {heure}.",
  "Venez-vous ? Répondez par SMS : OUI ou NON.",
  "{#plusieurs}Plusieurs battues en cours : ajoutez le jour, ex. OUI {jour}{/plusieurs}",
  "Ou répondez ici : {lien}",
  "Réponse avant le {limite}.",
].join("\n");

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
 * @typedef {Record<string, string | boolean>} TemplateVariables
 * Strings replace {name}; booleans keep or remove {#name}...{/name}.
 */

/**
 * Template variables of a hunt. Unknown values are empty.
 *
 * @param {HuntFields} hunt
 * @param {string} [link] The member's answer link.
 * @param {{ several?: boolean }} [options] several: the member has several
 *   open invitations (keeps the {#plusieurs} section).
 * @returns {TemplateVariables}
 */
function messageVariables(hunt, link = "", { several = false } = {}) {
  const deadline = parseUtcDateTime(hunt.response_deadline);
  return {
    date: formatFrenchDay(hunt.date),
    heure: formatFrenchTime(hunt.meeting_time),
    limite: deadline ? formatFrenchDeadline(deadline) : "",
    jour: String(Number(hunt.date.slice(8, 10))),
    lien: link,
    plusieurs: several,
  };
}

/**
 * Keeps the sections whose variable is true (or a non-empty string) without
 * their markers, and removes the others; a removed section filling whole
 * lines takes its line break along. Unclosed or mismatched sections are left
 * as they are.
 *
 * @param {string} body
 * @param {TemplateVariables} variables
 * @returns {string}
 */
function renderSections(body, variables) {
  let done = "";
  let rest = body;
  for (;;) {
    const open = /\{#([a-z]+)\}/.exec(rest);
    if (!open) return done + rest;
    const closing = `{/${open[1]}}`;
    const end = rest.indexOf(closing, open.index + open[0].length);
    if (end < 0) return done + rest;
    const before = done + rest.slice(0, open.index);
    const inner = rest.slice(open.index + open[0].length, end);
    const after = rest.slice(end + closing.length);
    if (
      Object.prototype.hasOwnProperty.call(variables, String(open[1])) &&
      variables[String(open[1])]
    ) {
      done = before + inner;
      rest = after;
    } else if (
      (before === "" || before.endsWith("\n")) &&
      (after === "" || after.startsWith("\n"))
    ) {
      // Whole lines: remove one line break along (the one before, last line).
      done = after === "" ? before.replace(/\n$/, "") : before;
      rest = after.slice(1);
    } else {
      done = before;
      rest = after;
    }
  }
}

/**
 * Renders the sections of `body`, then replaces each {name} whose variable
 * is a string. Unknown placeholders are left as they are; substituted values
 * are not scanned again.
 *
 * @param {string} body
 * @param {TemplateVariables} variables
 * @returns {string}
 */
function renderTemplate(body, variables) {
  return renderSections(body, variables).replace(
    /\{([a-z]+)\}/g,
    (placeholder, name) => {
      const value = Object.prototype.hasOwnProperty.call(variables, name)
        ? variables[name]
        : undefined;
      return typeof value === "string" ? value : placeholder;
    },
  );
}

/**
 * Renders an SMS: renderTemplate(), transliterated to GSM-7.
 *
 * @param {string} body
 * @param {TemplateVariables} variables
 * @returns {string}
 */
function renderSms(body, variables) {
  return toGsm7(renderTemplate(body, variables));
}

module.exports = {
  formatFrenchDay,
  formatFrenchTime,
  formatFrenchDeadline,
  messageVariables,
  renderTemplate,
  renderSms,
  DEFAULT_TEMPLATE_BODY,
};
