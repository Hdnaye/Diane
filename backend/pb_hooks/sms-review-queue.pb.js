/// <reference path="../pb_data/types.d.ts" />

// "To check" queue: a message is received now unless the SMS gateway says
// otherwise.

onRecordValidate((e) => {
  if (!e.record?.getString("received_at")) {
    e.record?.set("received_at", new DateTime());
  }
  e.next();
}, "sms_review_queue");
