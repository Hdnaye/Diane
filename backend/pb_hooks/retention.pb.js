/// <reference path="../pb_data/types.d.ts" />

// RGPD purge of SMS data, daily at 03:17 (cutoffs and reasons in
// lib/retention.cjs): `sms_review_queue` entries resolved more than 30
// days ago and every entry received more than 90 days ago; `sms_inbound`
// records (ids of handled webhooks) older than 7 days. Logs carry counts
// only.

cronAdd("dianePurgeSmsData", "17 3 * * *", () => {
  const { purgeCutoffs } = /** @type {typeof import("./lib/retention.cjs")} */ (
    require(`${__hooks}/lib/retention.cjs`)
  );
  const app = /** @type {core.App} */ (/** @type {unknown} */ ($app));
  const cutoffs = purgeCutoffs(new Date());

  /**
   * @param {string} collection
   * @param {string} filter
   */
  const purge = (collection, filter) => {
    const records = app.findRecordsByFilter(collection, filter, "", 0, 0, {
      ...cutoffs,
    });
    let deleted = 0;
    for (const record of records) {
      if (!record) continue;
      app.delete(record);
      deleted++;
    }
    return deleted;
  };

  const queue = purge(
    "sms_review_queue",
    "(resolved = true && resolved_at != '' && resolved_at < {:resolvedBefore})" +
      " || received_at < {:queuedBefore}",
  );
  const inbound = purge("sms_inbound", "created < {:inboundBefore}");
  app
    .logger()
    .info("SMS data purged", "sms_review_queue", queue, "sms_inbound", inbound);
});
