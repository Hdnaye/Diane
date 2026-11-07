/// <reference path="../pb_data/types.d.ts" />

// Organizer access (POC): a single auth account, created by `npm run setup`
// from backend/.env. Its password is the long random secret key the app
// authenticates with silently. Accounts are managed by superusers only.
migrate(
  (app) => {
    const collection = new Collection({
      type: "auth",
      name: "organizers",
      listRule: "id = @request.auth.id",
      viewRule: "id = @request.auth.id",
      // createRule, updateRule, deleteRule left null: superusers only.
    });
    collection.passwordAuth.enabled = true;
    collection.passwordAuth.identityFields = ["email"];
    collection.oauth2.enabled = false;
    collection.otp.enabled = false;
    collection.mfa.enabled = false;
    const password = /** @type {core.PasswordField} */ (
      collection.fields.getByName("password")
    );
    password.min = 32;
    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("organizers"));
  },
);
