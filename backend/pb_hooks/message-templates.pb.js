/// <reference path="../pb_data/types.d.ts" />

// Message templates: a template becoming the default replaces the previous
// default (a unique index guarantees there is at most one).

/** @param {core.RecordEvent} e */
const unsetOtherDefaults = (e) => {
  const record = /** @type {core.Record} */ (e.record);
  if (record.getBool("is_default")) {
    const others = e.app.findRecordsByFilter(
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
      e.app.save(other);
    }
  }
  e.next();
};

onRecordCreate(unsetOtherDefaults, "message_templates");
onRecordUpdate(unsetOtherDefaults, "message_templates");
