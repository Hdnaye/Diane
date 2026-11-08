// SMS encoding and length: a text made only of GSM-7 characters (GSM 03.38)
// fits 160 characters in one SMS, 153 per segment when split; a single other
// character (û, ê, ç, ’, emoji...) switches the whole SMS to UCS-2: 70
// characters, 67 per segment. Long SMS cost more and some old phones show
// them badly: generated SMS go through toGsm7() first.
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/sms-encoding.cjs`)
// and by Vitest with createRequire.

/** GSM 03.38 basic character set (one septet each), escape excluded. */
const GSM7_BASIC = new Set(
  Array.from(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
      "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ),
);

/** GSM 03.38 extension table: an escape septet plus one septet each. */
const GSM7_EXTENSION = new Set(Array.from("\f^{}\\[~]|€"));

/**
 * Closest GSM-7 equivalent of common French characters outside of it.
 * Characters missing here are left as they are.
 */
const TO_GSM7 = {
  â: "a",
  á: "a",
  ê: "e",
  ë: "e",
  î: "i",
  ï: "i",
  í: "i",
  ô: "o",
  ó: "o",
  û: "u",
  ú: "u",
  ÿ: "y",
  ç: "c",
  À: "A",
  Â: "A",
  È: "E",
  Ê: "E",
  Ë: "E",
  Î: "I",
  Ï: "I",
  Ô: "O",
  Û: "U",
  Ù: "U",
  œ: "oe",
  Œ: "OE",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "«": '"',
  "»": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  " ": " ",
  " ": " ",
  "\t": " ",
};

/**
 * Replaces the characters outside of GSM-7 that have a close equivalent
 * (û → u, ’ → ', « → "...), so that a French text stays GSM-7.
 *
 * @param {string} text
 * @returns {string}
 */
function toGsm7(text) {
  return Array.from(text, (char) =>
    Object.prototype.hasOwnProperty.call(TO_GSM7, char)
      ? TO_GSM7[/** @type {keyof typeof TO_GSM7} */ (char)]
      : char,
  ).join("");
}

/**
 * Number of segments of `sizes` (units of each character, in order), packed
 * greedily: a character never spans two segments.
 *
 * @param {number[]} sizes
 * @param {number} single Capacity of a single-segment SMS.
 * @param {number} perSegment Capacity of each segment of a long SMS.
 */
function countSegments(sizes, single, perSegment) {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total === 0) return 0;
  if (total <= single) return 1;
  let segments = 1;
  let used = 0;
  for (const size of sizes) {
    if (used + size > perSegment) {
      segments++;
      used = 0;
    }
    used += size;
  }
  return segments;
}

/**
 * @typedef {object} SmsSize
 * @property {"GSM-7" | "UCS-2"} encoding
 * @property {number} units    Septets (GSM-7) or UTF-16 code units (UCS-2).
 * @property {number} segments SMS segments billed and sent.
 */

/**
 * Encoding and number of segments of an SMS.
 *
 * @param {string} text
 * @returns {SmsSize}
 */
function smsSegments(text) {
  // Array.from splits by code point (an emoji is a single item).
  const chars = Array.from(text);
  const gsm = chars.every(
    (char) => GSM7_BASIC.has(char) || GSM7_EXTENSION.has(char),
  );
  const sizes = gsm
    ? chars.map((char) => (GSM7_EXTENSION.has(char) ? 2 : 1))
    : chars.map((char) => char.length);
  return {
    encoding: gsm ? "GSM-7" : "UCS-2",
    units: sizes.reduce((sum, size) => sum + size, 0),
    segments: gsm
      ? countSegments(sizes, 160, 153)
      : countSegments(sizes, 70, 67),
  };
}

module.exports = { smsSegments, toGsm7 };
