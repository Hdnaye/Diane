/// <reference path="../pb_data/types.d.ts" />

// SMS replies that were not recognized (ambiguous, conditional...): the
// "to check" queue. `member` is set when the sender's number is known; the
// message is deleted with the member (right to erasure). Defaults:
// pb_hooks/sms-review-queue.pb.js.
migrate(
  (app) => {
    const organizerOnly = '@request.auth.collectionName = "organizers"';
    const collection = new Collection({
      type: "base",
      name: "sms_review_queue",
      listRule: organizerOnly,
      viewRule: organizerOnly,
      createRule: organizerOnly,
      updateRule: organizerOnly,
      deleteRule: organizerOnly,
    });
    collection.fields.add(
      new TextField({ name: "from_phone", required: true, max: 32 }),
      new TextField({ name: "body", required: true, max: 2000 }),
      new DateField({ name: "received_at", required: true }),
      new RelationField({
        name: "member",
        collectionId: app.findCollectionByNameOrId("members").id,
        maxSelect: 1,
        cascadeDelete: true,
      }),
      new BoolField({ name: "resolved" }),
      new AutodateField({ name: "created", onCreate: true }),
      new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
    );
    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("sms_review_queue"));
  },
);
