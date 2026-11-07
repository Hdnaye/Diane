/// <reference path="../pb_data/types.d.ts" />

// PocketBase creates a default `users` auth collection open to sign-up. Diane
// has no user accounts besides the organizer (`organizers`): delete it, so
// that nobody can create an account. Not restored on revert.
migrate((app) => {
  /** @type {core.Collection | undefined} */
  let users;
  try {
    users = app.findCollectionByNameOrId("users");
  } catch {
    return; // Already deleted.
  }
  app.delete(users);
});
