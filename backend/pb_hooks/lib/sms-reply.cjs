// Interprets a member's SMS reply to an invitation.
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/sms-reply.cjs`)
// and by Vitest with createRequire.
//
// A false "yes" skews the head count and the waiting list: only noise that
// cannot change the meaning of the reply is tolerated. When in doubt, the
// reply is not recognized and goes to the "to check" queue.

/**
 * @typedef {object} SmsReply
 * @property {"yes" | "no"} answer
 * @property {number} [day] Day of the month of the hunt, when several are open.
 */

/**
 * Closed list of courtesy phrases tolerated before and/or after the reply,
 * normalized (lower case, no accents). Validated with the organizer: extend
 * it deliberately, never with an open pattern.
 */
const POLITE_PHRASES = Object.freeze([
  "merci",
  "merci beaucoup",
  "desole",
  "desolee",
  "bonjour",
  "bonsoir",
  "cordialement",
  "bonne journee",
  "bonne soiree",
]);

/** Courtesy phrases as word lists, longest first. */
const POLITE_WORDS = POLITE_PHRASES.map((phrase) => phrase.split(" ")).sort(
  (a, b) => b.length - a.length,
);

/** Combining diacritical marks, left by NFD normalization. */
const DIACRITICS = /[\u0300-\u036f]/g;

/**
 * Characters treated as word separators: whitespace, ASCII punctuation
 * except "?" (hesitation), Latin-1 punctuation and symbols (« » …), general
 * punctuation, symbols and dingbats (… ’ – ✅ ❤), variation selector and
 * emojis (surrogate pairs).
 */
const SEPARATORS =
  /[\s!"#$%&'()*+,\-./:;<=>@[\\\]^_`{|}~\u00a1-\u00be\u00d7\u00f7\u2000-\u2bff]|\ufe0f|[\ud83c-\ud83e][\udc00-\udfff]/g;

/**
 * Returns the index after the courtesy phrases starting at `index`.
 *
 * @param {string[]} words
 * @param {number} index
 */
function skipPolitePhrases(words, index) {
  let i = index;
  for (;;) {
    const phrase = POLITE_WORDS.find((candidate) =>
      candidate.every((word, offset) => words[i + offset] === word),
    );
    if (!phrase) return i;
    i += phrase.length;
  }
}

/**
 * Parses `OUI` / `NON`, optionally followed by a day of the month
 * (`OUI 15`, `oui, le 15`), ignoring case, accents, punctuation, emojis and
 * the courtesy phrases of {@link POLITE_PHRASES} around it.
 *
 * @param {string} text Raw SMS body.
 * @returns {SmsReply | null} `null` when the reply is not recognized.
 */
function parseSmsReply(text) {
  if (typeof text !== "string") return null;

  const normalized = text
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase();
  // A sign glued to a number ("-3") is not a separator.
  if (/[-+]\d/.test(normalized)) return null;
  const spaced = normalized.replace(SEPARATORS, " ");
  // Any other character (question mark, other alphabets, other digits...).
  if (/[^a-z0-9 ]/.test(spaced)) return null;
  const words = spaced.match(/[a-z]+|[0-9]+/g) ?? [];

  let i = skipPolitePhrases(words, 0);
  const answer = words[i++];
  if (answer !== "oui" && answer !== "non") return null;
  /** @type {SmsReply} */
  const reply = { answer: answer === "oui" ? "yes" : "no" };

  const article = words[i] === "le";
  if (article) i++;
  const day = words[i];
  if (day !== undefined && /^\d{1,2}$/.test(day)) {
    reply.day = Number(day);
    if (reply.day < 1 || reply.day > 31) return null;
    i++;
  } else if (article) {
    return null;
  }

  return skipPolitePhrases(words, i) === words.length ? reply : null;
}

module.exports = { parseSmsReply, POLITE_PHRASES };
