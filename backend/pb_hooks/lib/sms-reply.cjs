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
 * Closed list of characters treated as word separators, besides whitespace
 * (including non-breaking spaces). Any other character makes the reply
 * unrecognized: "?", "‽", "🤔", "🤷", "👎", "❌", "≠"... may express doubt
 * or contradiction. Extend it deliberately, like POLITE_PHRASES.
 *
 * Code points compared as numbers on purpose: goja compiles regular
 * expressions to Go's RE2, where a surrogate-pair class (emojis) never
 * matches.
 */
const SEPARATORS = new Set([
  // Punctuation: . , ; : ! … ' ’ " « » ( ) - – —
  0x2e, 0x2c, 0x3b, 0x3a, 0x21, 0x2026, 0x27, 0x2019, 0x22, 0xab, 0xbb, 0x28,
  0x29, 0x2d, 0x2013, 0x2014,
  // Positive or neutral emojis: 👍 👌 ✅ ✔ ❤ 🙂 😊 🙏
  0x1f44d, 0x1f44c, 0x2705, 0x2714, 0x2764, 0x1f642, 0x1f60a, 0x1f64f,
  // Skin tone modifiers, variation selector-16, zero width joiner.
  0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff, 0xfe0f, 0x200d,
]);

/** @param {string} char A single code point. */
function isSeparator(char) {
  return char.trim() === "" || SEPARATORS.has(char.codePointAt(0) ?? -1);
}

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
  // Array.from splits by code point (an emoji is a single item).
  const spaced = Array.from(normalized, (char) =>
    isSeparator(char) ? " " : char,
  ).join("");
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
