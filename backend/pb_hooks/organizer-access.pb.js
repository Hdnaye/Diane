/// <reference path="../pb_data/types.d.ts" />

// Record requests (list, view, create, update, delete) on the organizer
// collections without a valid organizer (or superuser) session get an
// explicit 401. The collection rules already let guests see and change
// nothing, but PocketBase answers a guest list with 200 and an empty list
// (and a guest view with 404): the app, whose session is missing or expired,
// would believe there is no data. A middleware rather than
// onRecordsListRequest / onRecordViewRequest: PocketBase applies the rules
// (404) before triggering the view hook. Runs after PocketBase loads the
// auth token (priority -1020) and after the rate limiter (-1000).
// Public routes (/api/diane/r/..., the SMS gateway webhook) and the auth
// routes (/api/collections/organizers/auth-...) are not record routes.
routerUse(
  new Middleware(
    (e) => {
      const ORGANIZER_COLLECTIONS = [
        "organizers",
        "members",
        "hunts",
        "invitations",
        "message_templates",
        "sms_review_queue",
        "sms_inbound",
      ];
      const path = e.request?.url?.path ?? "";
      if (!/^\/api\/collections\/[^/]+\/records(\/|$)/.test(path)) {
        return e.next();
      }
      /** @type {core.Collection} */
      let collection;
      try {
        collection = e.app.findCachedCollectionByNameOrId(
          e.request?.pathValue("collection") ?? "",
        );
      } catch {
        // Unknown collection: PocketBase's own 404.
        return e.next();
      }
      if (!ORGANIZER_COLLECTIONS.includes(collection.name)) return e.next();
      const isOrganizer = e.auth?.collection().name === "organizers";
      if (!isOrganizer && !e.hasSuperuserAuth()) {
        throw new UnauthorizedError(
          "The request requires a valid organizer session.",
        );
      }
      return e.next();
    },
    0,
    "dianeOrganizerAccess",
  ),
);
