/// <reference path="../pb_data/types.d.ts" />

// Liveness probe for the Diane hooks layer (distinct from PocketBase's
// built-in /api/health): proves pb_hooks/ are loaded.
routerAdd("GET", "/api/diane/health", (e) => {
  return e.json(200, { status: "ok" });
});
