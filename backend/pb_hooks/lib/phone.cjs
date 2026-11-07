// Normalizes French phone numbers to E.164 (+33XXXXXXXXX), the format the
// SMS gateway reports senders in.
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/phone.cjs`)
// and by Vitest with createRequire.

/**
 * Separators people type between digit groups: spaces (including
 * non-breaking ones), dots, dashes, slashes.
 */
const SEPARATORS = /[\s\u00a0\u202f.\-/]/g;

/**
 * Returns `input` as a French E.164 number, or null if it is not one.
 * Accepts the national format (06 39 98 00 01) and the international ones
 * (+33 6..., +33 (0)6..., +33 06..., 0033 6...).
 *
 * @param {string} input
 * @returns {string | null}
 */
function normalizeFrenchPhone(input) {
  const compact = input.replace(SEPARATORS, "").replace("(0)", "0");
  const match = /^(?:0|\+330?|00330?)([1-9][0-9]{8})$/.exec(compact);
  return match ? `+33${match[1]}` : null;
}

module.exports = { normalizeFrenchPhone };
