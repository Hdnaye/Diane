/// <reference path="../pb_data/types.d.ts" />

// Organizer accounts are managed by superusers only (`npm run setup`): refuse
// every e-mail flow (password reset, verification, e-mail change, login code
// by e-mail) on the `organizers` collection, addressed by name or id. Refused before the
// account is looked up, so the answer does not reveal the organizer's email.
routerUse((e) => {
  const match =
    /^\/api\/collections\/([^/]+)\/(?:(?:request|confirm)-(?:password-reset|verification|email-change)|request-otp|auth-with-otp)$/.exec(
      e.request?.url?.path ?? "",
    );
  if (match) {
    let name = "";
    try {
      name = $app.findCollectionByNameOrId(String(match[1])).name;
    } catch {
      // Unknown collection: PocketBase answers 404.
    }
    if (name === "organizers") {
      throw new ForbiddenError(
        "Organizer accounts are managed by the administrator.",
      );
    }
  }
  return e.next();
});
