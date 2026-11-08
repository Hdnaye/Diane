/// <reference path="../pb_data/types.d.ts" />

// PocketBase's default rate limit rules (`*:auth`, `*:create`, `/api/batch`,
// `/api/`) apply to every client: the organizer creating 30 members in a row
// got 429 from `*:create` (20 per 5 s). They now apply to guests only, and
// authenticated requests (the single organizer) get one broad rule, which
// only stops a runaway client. Logging in is always a guest request: `*:auth`
// still slows down password guessing. The answer routes rule
// (1762500600_invitation_sending.js) stays first.

const DEFAULT_LABELS = ["*:auth", "*:create", "/api/batch", "/api/"];

/** @type {core.RateLimitRule} */
const AUTH_RULE = /** @type {core.RateLimitRule} */ ({
  label: "/api/",
  audience: "@auth",
  duration: 10,
  maxRequests: 600,
});

/** @param {core.RateLimitRule} rule */
const isAuthRule = (rule) =>
  rule.label === AUTH_RULE.label && rule.audience === AUTH_RULE.audience;

migrate(
  (app) => {
    const settings = app.settings();
    const rules = settings.rateLimits.rules.filter((rule) => !isAuthRule(rule));
    for (const rule of rules) {
      if (rule.audience === "" && DEFAULT_LABELS.includes(rule.label)) {
        rule.audience = "@guest";
      }
    }
    settings.rateLimits.rules = [...rules, AUTH_RULE];
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    const rules = settings.rateLimits.rules.filter((rule) => !isAuthRule(rule));
    for (const rule of rules) {
      if (rule.audience === "@guest" && DEFAULT_LABELS.includes(rule.label)) {
        rule.audience = "";
      }
    }
    settings.rateLimits.rules = rules;
    app.save(settings);
  },
);
