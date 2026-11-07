/// <reference path="../pb_data/types.d.ts" />

// Reusable invitation messages (SMS and e-mail), with variables rendered by
// pb_hooks/lib/message-template.cjs: {date}, {heure}, {limite}, {jour},
// {lien}. At most one default template (pb_hooks/message-templates.pb.js).
// Seeds a short French default, readable by elderly members.
migrate(
  (app) => {
    const organizerOnly = '@request.auth.collectionName = "organizers"';
    const collection = new Collection({
      type: "base",
      name: "message_templates",
      listRule: organizerOnly,
      viewRule: organizerOnly,
      createRule: organizerOnly,
      updateRule: organizerOnly,
      deleteRule: organizerOnly,
    });
    collection.fields.add(
      new TextField({ name: "name", required: true, max: 100 }),
      new TextField({ name: "body", required: true, max: 2000 }),
      new BoolField({ name: "is_default" }),
      new AutodateField({ name: "created", onCreate: true }),
      new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
    );
    collection.addIndex(
      "idx_message_templates_single_default",
      true,
      "is_default",
      "is_default = TRUE",
    );
    app.save(collection);

    const template = new Record(collection);
    template.set("name", "Invitation");
    template.set(
      "body",
      [
        "Battue le {date} à {heure}.",
        "Venez-vous ? Répondez par SMS : OUI ou NON.",
        "S'il y a plusieurs battues, ajoutez le jour : OUI {jour}",
        "Ou répondez ici : {lien}",
        "Réponse avant le {limite}.",
      ].join("\n"),
    );
    template.set("is_default", true);
    app.save(template);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("message_templates"));
  },
);
