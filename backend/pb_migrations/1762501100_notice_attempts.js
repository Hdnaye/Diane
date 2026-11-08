/// <reference path="../pb_data/types.d.ts" />

// Capped automatic retries of reminders and cancellation notices
// (noticeChannelsToSend in pb_hooks/lib/notifications.cjs):
// - `not_sent` status for every channel (invitation, reminder,
//   cancellation): not attempted, the gateway was found unreachable earlier
//   in the same sending; sent again like `failed`;
// - `*_attempts` counters per notice channel (at most 3 attempts);
// - `ambiguous` reason in the "to check" queue: a reply without day while
//   another upcoming hunt still waits for the member's answer.

const NOTICE_KINDS = ["reminder", "cancellation"];
const NOTICE_CHANNELS = ["sms", "email"];
const NOTICE_STATUS_VALUES = ["sending", "sent", "failed", "skipped"];
const ALL_STATUS_FIELDS = [
  "sms_status",
  "email_status",
  "reminder_sms_status",
  "reminder_email_status",
  "cancellation_sms_status",
  "cancellation_email_status",
];

migrate(
  (app) => {
    const invitations = app.findCollectionByNameOrId("invitations");
    for (const name of ALL_STATUS_FIELDS) {
      const field = /** @type {core.SelectField} */ (
        invitations.fields.getByName(name)
      );
      field.values = [...NOTICE_STATUS_VALUES, "not_sent"];
    }
    for (const notice of NOTICE_KINDS) {
      for (const channel of NOTICE_CHANNELS) {
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
    for (const name of ALL_STATUS_FIELDS) {
      // Not sent: failed, so that it can still be resent.
      const records = app.findRecordsByFilter(
        "invitations",
        `${name} = 'not_sent'`,
        "",
        0,
        0,
      );
      for (const record of records) {
        if (!record) continue;
        record.set(name, "failed");
        app.save(record);
      }
      const field = /** @type {core.SelectField} */ (
        invitations.fields.getByName(name)
      );
      field.values = NOTICE_STATUS_VALUES;
    }
    for (const notice of NOTICE_KINDS) {
      for (const channel of NOTICE_CHANNELS) {
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
