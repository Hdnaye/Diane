// How long SMS data is kept (RGPD, minimization), applied by a daily cron
// (pb_hooks/retention.pb.js):
// - sms_review_queue, resolved: REVIEW_RESOLVED_RETENTION_DAYS after being
//   resolved, enough to answer a member who disputes how a message was
//   handled after a hunt;
// - sms_review_queue, any entry: REVIEW_MAX_RETENTION_DAYS after reception;
//   an SMS left unresolved that long concerns a hunt long past;
// - sms_inbound (ids of the webhooks already handled, no message body):
//   INBOUND_RETENTION_DAYS, beyond the gateway's retries (about 2 days by
//   default).
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/retention.cjs`)
// and by Vitest with createRequire.

const { toPocketBaseDate } = require("./invitations.cjs");

const REVIEW_RESOLVED_RETENTION_DAYS = 30;
const REVIEW_MAX_RETENTION_DAYS = 90;
const INBOUND_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * PocketBase datetimes before which records are deleted.
 *
 * @param {Date} now
 */
function purgeCutoffs(now) {
  /** @param {number} days */
  const before = (days) =>
    toPocketBaseDate(new Date(now.getTime() - days * DAY_MS));
  return {
    resolvedBefore: before(REVIEW_RESOLVED_RETENTION_DAYS),
    queuedBefore: before(REVIEW_MAX_RETENTION_DAYS),
    inboundBefore: before(INBOUND_RETENTION_DAYS),
  };
}

module.exports = {
  REVIEW_RESOLVED_RETENTION_DAYS,
  REVIEW_MAX_RETENTION_DAYS,
  INBOUND_RETENTION_DAYS,
  purgeCutoffs,
};
