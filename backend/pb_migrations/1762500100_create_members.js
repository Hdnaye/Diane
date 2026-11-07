/// <reference path="../pb_data/types.d.ts" />

// Members of the association. Personal data (RGPD): only a name and an
// email and/or a phone number. Deleting a member deletes its invitations and
// SMS (right to erasure). Validation and defaults: pb_hooks/members.pb.js.
migrate(
  (app) => {
    const organizerOnly = '@request.auth.collectionName = "organizers"';
    const collection = new Collection({
      type: "base",
      name: "members",
      listRule: organizerOnly,
      viewRule: organizerOnly,
      createRule: organizerOnly,
      updateRule: organizerOnly,
      deleteRule: organizerOnly,
    });
    collection.fields.add(
      new TextField({ name: "name", required: true, max: 200 }),
      new EmailField({ name: "email" }),
      // E.164, e.g. +33639980001.
      new TextField({ name: "phone", max: 16 }),
      new BoolField({ name: "active" }),
      new AutodateField({ name: "created", onCreate: true }),
      new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
    );
    collection.addIndex("idx_members_email", true, "email", "email != ''");
    collection.addIndex("idx_members_phone", true, "phone", "phone != ''");
    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("members"));
  },
);
