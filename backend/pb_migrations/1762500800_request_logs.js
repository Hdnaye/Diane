/// <reference path="../pb_data/types.d.ts" />

// PocketBase's request logs (GDPR, data minimization):
// - no client IP (`logIP`, on by default): an IP is personal data, and the
//   answer page is opened by members;
// - kept 2 days instead of 5: enough to look into a problem reported the
//   next day or after a weekend hunt (Saturday -> Monday morning), short
//   enough not to build up a history of who answered when.
// Answer link tokens are kept out of the logs by pb_hooks/request-logs.pb.js.

const MAX_DAYS = 2;
const PREVIOUS_MAX_DAYS = 5;

migrate(
  (app) => {
    const settings = app.settings();
    settings.logs.logIP = false;
    settings.logs.maxDays = MAX_DAYS;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.logs.logIP = true;
    settings.logs.maxDays = PREVIOUS_MAX_DAYS;
    app.save(settings);
  },
);
