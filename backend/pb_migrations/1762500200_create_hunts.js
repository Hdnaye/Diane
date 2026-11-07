/// <reference path="../pb_data/types.d.ts" />

// Hunts: at most one per day. `date` is a Paris calendar day (YYYY-MM-DD)
// and `meeting_time` a Paris wall time (HH:MM), kept as text: no time zone
// conversion can shift the day. Validation and defaults: pb_hooks/hunts.pb.js.
migrate(
  (app) => {
    const organizerOnly = '@request.auth.collectionName = "organizers"';
    const collection = new Collection({
      type: "base",
      name: "hunts",
      listRule: organizerOnly,
      viewRule: organizerOnly,
      createRule: organizerOnly,
      updateRule: organizerOnly,
      deleteRule: organizerOnly,
    });
    collection.fields.add(
      new TextField({
        name: "date",
        required: true,
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      }),
      new TextField({
        name: "meeting_time",
        required: true,
        pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
      }),
      // 0 (empty): no limit.
      new NumberField({ name: "max_participants", onlyInt: true, min: 1 }),
      new DateField({ name: "response_deadline" }),
      new SelectField({
        name: "status",
        required: true,
        maxSelect: 1,
        values: ["draft", "invitations_sent", "closed", "cancelled"],
      }),
      new DateField({ name: "invitations_sent_at" }),
      new DateField({ name: "reminder_sent_at" }),
      new AutodateField({ name: "created", onCreate: true }),
      new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
    );
    collection.addIndex("idx_hunts_date", true, "date", "");
    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("hunts"));
  },
);
