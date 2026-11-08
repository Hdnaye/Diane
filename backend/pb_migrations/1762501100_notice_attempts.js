/// <reference path="../pb_data/types.d.ts" />

// Capped automatic retries of reminders and cancellation notices
// (noticeChannelsToSend in pb_hooks/lib/notifications.cjs):
// - `unknown` status for reminder_* / cancellation_* channels: the gateway
//   did not answer in time, the SMS may have been sent; never retried
//   automatically;
// - `*_attempts` counters per channel (at most 3 attempts);
// - `ambiguous` reason in the "to check" queue: a reply without day while
//   another upcoming hunt still waits for the member's answer.

const NOTICE_KINDS = ["reminder", "cancellation"];
const NOTICE_CHANNELS = ["sms", "email"];
const NOTICE_STATUS_VALUES = ["sending", "sent", "failed", "skipped"];

migrate(
  (app) => {
    const invitations = app.findCollectionByNameOrId("invitations");
    for (const notice of NOTICE_KINDS) {
      for (const channel of NOTICE_CHANNELS) {
        const field = /** @type {core.SelectField} */ (
          invitations.fields.getByName(`${notice}_${channel}_status`)
        );
        field.values = [...NOTICE_STATUS_VALUES, "unknown"];
        invitations.fields.add(
          new NumberField({
            name: `${notice}_${channel}_attempts`,
            onlyInt: true,
            min: 0,
          }),
        );
      }
    }
    app.save(invitations);

    const queue = app.findCollectionByNameOrId("sms_review_queue");
    const reason = /** @type {core.SelectField} */ (
      queue.fields.getByName("reason")
    );
    reason.values = [...reason.values, "ambiguous"];
    app.save(queue);
  },
  (app) => {
    const invitations = app.findCollectionByNameOrId("invitations");
    for (const notice of NOTICE_KINDS) {
      for (const channel of NOTICE_CHANNELS) {
        const name = `${notice}_${channel}_status`;
        // May have been sent: recorded as sent, never sent again.
        const records = app.findRecordsByFilter(
          "invitations",
          `${name} = 'unknown'`,
          "",
          0,
          0,
        );
        for (const record of records) {
          if (!record) continue;
          record.set(name, "sent");
          app.save(record);
        }
        const field = /** @type {core.SelectField} */ (
          invitations.fields.getByName(name)
        );
        field.values = NOTICE_STATUS_VALUES;
        invitations.fields.removeByName(`${notice}_${channel}_attempts`);
      }
    }
    app.save(invitations);

    const queue = app.findCollectionByNameOrId("sms_review_queue");
    const items = app.findRecordsByFilter(
      "sms_review_queue",
      "reason = 'ambiguous'",
      "",
      0,
      0,
    );
    for (const item of items) {
      if (!item) continue;
      item.set("reason", "several_open_invitations");
      app.save(item);
    }
    const reason = /** @type {core.SelectField} */ (
      queue.fields.getByName("reason")
    );
    reason.values = reason.values.filter((value) => value !== "ambiguous");
    app.save(queue);
  },
);
