/// <reference path="../pb_data/types.d.ts" />

// `sending` status of `sms_status` / `email_status`: a channel claimed by a
// sending request and not sent yet. A sending interrupted (restart, power
// cut, kill) leaves it visible, and `resend-failed` takes it over (see
// channelsToResend in pb_hooks/lib/invitations.cjs).

const NAMES = ["sms_status", "email_status"];

migrate(
  (app) => {
    const invitations = app.findCollectionByNameOrId("invitations");
    for (const name of NAMES) {
      const field = /** @type {core.SelectField} */ (
        invitations.fields.getByName(name)
      );
      field.values = ["sending", "sent", "failed", "skipped"];
    }
    app.save(invitations);
  },
  (app) => {
    // Never sent for sure: failed, so that it can still be resent.
    for (const name of NAMES) {
      const records = app.findRecordsByFilter(
        "invitations",
        `${name} = 'sending'`,
        "",
        0,
        0,
      );
      for (const record of records) {
        if (!record) continue;
        record.set(name, "failed");
        app.save(record);
      }
    }
    const invitations = app.findCollectionByNameOrId("invitations");
    for (const name of NAMES) {
      const field = /** @type {core.SelectField} */ (
        invitations.fields.getByName(name)
      );
      field.values = ["sent", "failed", "skipped"];
    }
    app.save(invitations);
  },
);
