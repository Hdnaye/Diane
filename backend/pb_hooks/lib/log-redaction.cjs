// Keeps answer link tokens out of PocketBase's request logs: whoever reads
// the logs (admin UI, backups of pb_data/) could otherwise answer for a
// member. Used by pb_hooks/request-logs.pb.js.
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/log-redaction.cjs`)
// and by Vitest with createRequire.

/** The path segment after "/r/" (answer page and /api/diane/r/ routes). */
const ANSWER_TOKEN = /\/r\/[^/?#\s]+/g;

/**
 * `text` (a request URI or a Referer) with every answer token replaced by
 * ":token", e.g. "/api/diane/r/Xy...z?x=1" -> "/api/diane/r/:token?x=1".
 *
 * @param {string} text
 * @returns {string}
 */
function redactAnswerTokens(text) {
  return text.replace(ANSWER_TOKEN, "/r/:token");
}

module.exports = { redactAnswerTokens };
