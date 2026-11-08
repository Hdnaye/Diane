/// <reference path="../pb_data/types.d.ts" />

// "To check" queue: a message is received now unless the SMS gateway says
// otherwise; `resolved_at` is set when the message gets resolved (cleared
// when reopened), for the purge (pb_hooks/retention.pb.js).

onRecordValidate((e) => {
  const record = /** @type {core.Record} */ (e.record);
  if (!record.getString("received_at")) {
    record.set("received_at", new DateTime());
  }
  if (!record.getBool("resolved")) {
    record.set("resolved_at", "");
  } else if (!record.getString("resolved_at")) {
    record.set("resolved_at", new DateTime());
  }
  e.next();
}, "sms_review_queue");
