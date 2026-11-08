/// <reference path="../pb_data/types.d.ts" />

// Incoming SMS, reminders and cancellation:
// - `sms_inbound`: webhooks of the SMS gateway already handled (event id,
//   unique: a webhook sent again is handled once), the member, the outcome
//   and the confirmation SMS status. No phone number, no message. Written
//   by pb_hooks/sms-webhook.pb.js only; purged after 7 days
//   (pb_hooks/lib/retention.cjs).
// - `sms_review_queue`: `reason` (why the SMS is to check) and
//   `resolved_at` (set when resolved, for the purge).
// - invitations: status of the reminder and of the cancellation notice per
//   channel, same values as `sms_status` / `email_status`.
// - hunts: `cancelled_at`.

const STATUSES = ["sending", "sent", "failed", "skipped"];
const NOTICE_FIELDS = [
  "reminder_sms_status",
  "reminder_email_status",
  "cancellation_sms_status",
  "cancellation_email_status",
];
const REVIEW_REASONS = [
  "unknown_sender",
  "inactive_member",
  "unrecognized",
  "no_open_invitation",
  "several_open_invitations",
  "unknown_day",
  "ambiguous_day",
  "deadline_passed",
  "hunt_closed",
];

migrate(
  (app) => {
    const organizerOnly = '@request.auth.collectionName = "organizers"';
    const inbound = new Collection({
      type: "base",
      name: "sms_inbound",
      listRule: organizerOnly,
      viewRule: organizerOnly,
      // No create/update/delete rule: superusers only, written by the
      // webhook hook.
    });
    inbound.fields.add(
      new TextField({ name: "event_id", required: true, max: 64 }),
      new RelationField({
        name: "member",
        collectionId: app.findCollectionByNameOrId("members").id,
        maxSelect: 1,
        cascadeDelete: true,
      }),
      new SelectField({
        name: "outcome",
        required: true,
        maxSelect: 1,
        values: ["applied", "cancelled", "review", "ignored"],
      }),
      new SelectField({ name: "confirmation", maxSelect: 1, values: STATUSES }),
      new AutodateField({ name: "created", onCreate: true }),
      new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
    );
    inbound.addIndex("idx_sms_inbound_event_id", true, "event_id", "");
    app.save(inbound);

    const queue = app.findCollectionByNameOrId("sms_review_queue");
    queue.fields.add(
      new SelectField({ name: "reason", maxSelect: 1, values: REVIEW_REASONS }),
      new DateField({ name: "resolved_at" }),
    );
    app.save(queue);

    const invitations = app.findCollectionByNameOrId("invitations");
    for (const name of NOTICE_FIELDS) {
      invitations.fields.add(
        new SelectField({ name, maxSelect: 1, values: STATUSES }),
      );
    }
    app.save(invitations);

    const hunts = app.findCollectionByNameOrId("hunts");
    hunts.fields.add(new DateField({ name: "cancelled_at" }));
    app.save(hunts);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("sms_inbound"));
    const queue = app.findCollectionByNameOrId("sms_review_queue");
    queue.fields.removeByName("reason");
    queue.fields.removeByName("resolved_at");
    app.save(queue);
    const invitations = app.findCollectionByNameOrId("invitations");
    for (const name of NOTICE_FIELDS) invitations.fields.removeByName(name);
    app.save(invitations);
    const hunts = app.findCollectionByNameOrId("hunts");
    hunts.fields.removeByName("cancelled_at");
    app.save(hunts);
  },
);
