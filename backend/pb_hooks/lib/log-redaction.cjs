// Keeps answer link tokens out of PocketBase's request logs: whoever reads
// the logs (admin UI, backups of pb_data/) could otherwise answer for a
// member. Used by pb_hooks/request-logs.pb.js.
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/log-redaction.cjs`)
// and by Vitest with createRequire.

/** The path segment after "/r/" (answer page and /api/diane/r/ routes). */
const ANSWER_TOKEN = /\/r\/[^/?#\s]+/g;

/**
 * Any run of at least 43 alphanumeric characters (a token's length),
 * wherever it is: hand-crafted requests (query, upper case path, unknown
 * route, encoded Referer, User-Agent). Longer runs are redacted whole, e.g.
 * "%2F" followed by a token.
 */
const TOKEN_LIKE = /[A-Za-z0-9]{43,}/g;

/**
 * `text` (a request path or query, a Referer, a User-Agent) with every
 * answer token replaced by ":token", e.g. "/api/diane/r/Xy...z?x=1" ->
 * "/api/diane/r/:token?x=1".
 *
 * @param {string} text
 * @returns {string}
 */
function redactAnswerTokens(text) {
  return text.replace(ANSWER_TOKEN, "/r/:token").replace(TOKEN_LIKE, ":token");
}

module.exports = { redactAnswerTokens };
