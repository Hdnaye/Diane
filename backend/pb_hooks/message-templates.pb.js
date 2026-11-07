/// <reference path="../pb_data/types.d.ts" />

// Message templates: a template becoming the default replaces the previous
// default (a unique index guarantees there is at most one). Both saves run in
// one transaction: if the new default is invalid, the previous one stays.

/** @param {core.RecordEvent} e */
const replaceDefault = (e) => {
  const record = /** @type {core.Record} */ (e.record);
  if (!record.getBool("is_default")) {
    e.next();
    return;
  }
  e.app.runInTransaction((txApp) => {
    const others = txApp.findRecordsByFilter(
      "message_templates",
      "is_default = true && id != {:id}",
      "",
      0,
      0,
      { id: record.id },
    );
    for (const other of others) {
      if (!other) continue;
      other.set("is_default", false);
      txApp.save(other);
    }
    // The record itself is saved by the next handlers, in this transaction.
    e.app = txApp;
    e.next();
  });
};

onRecordCreate(replaceDefault, "message_templates");
onRecordUpdate(replaceDefault, "message_templates");
