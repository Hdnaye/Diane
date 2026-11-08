/// <reference path="../pb_data/types.d.ts" />

// Keeps answer link tokens out of PocketBase's request logs (`_logs`):
// the URL of the answer page and routes (/r/{token}, /api/diane/r/{token})
// and the Referer of requests sent from the answer page carry it. Any
// token-like run (43+ alphanumeric characters) in the path, the query, the
// Referer or the User-Agent is redacted too (hand-crafted requests).
// PocketBase's activity logger (priority -1040) logs the request after the
// other middlewares and the route ran: this middleware runs just inside it,
// before the rate limiter (-1000), and redacts the request once handled, so
// that every outcome is covered, including 429 and 404. Client IPs are not
// logged at all (pb_migrations/1762500800_request_logs.js).
routerUse(
  new Middleware(
    (e) => {
      const { redactAnswerTokens } =
        /** @type {typeof import("./lib/log-redaction.cjs")} */ (
          require(`${__hooks}/lib/log-redaction.cjs`)
        );
      try {
        return e.next();
      } finally {
        const request = e.request;
        if (request?.url) {
          const path = redactAnswerTokens(request.url.path);
          if (path !== request.url.path) {
            request.url.path = path;
            request.url.rawPath = "";
          }
          request.url.rawQuery = redactAnswerTokens(request.url.rawQuery);
        }
        for (const name of ["Referer", "User-Agent"]) {
          const value = request?.header.get(name) ?? "";
          if (value) request?.header.set(name, redactAnswerTokens(value));
        }
      }
    },
    -1035,
    "dianeRedactAnswerTokens",
  ),
);
