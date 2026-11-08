/// <reference path="../pb_data/types.d.ts" />

// Sending invitations (pb_hooks/send-invitations.pb.js):
// - `sms_status` / `email_status` on invitations: sent, failed (gateway or
//   SMTP missing or in error) or skipped (no phone / no e-mail);
// - the seeded default template becomes shorter and GSM-7 friendly, with
//   the "add the day" line only for members with several open invitations
//   (same text as DEFAULT_TEMPLATE_BODY in pb_hooks/lib/message-template.cjs).
//   A template already edited by the organizer is left as it is.
// - PocketBase's rate limiter is enabled, with a rule for the public answer
//   routes (/api/diane/r/...): per IP, guests only.

const PREVIOUS_DEFAULT_BODY = [
  "Battue le {date} à {heure}.",
  "Venez-vous ? Répondez par SMS : OUI ou NON.",
  "S'il y a plusieurs battues, ajoutez le jour : OUI {jour}",
  "Ou répondez ici : {lien}",
  "Réponse avant le {limite}.",
].join("\n");

const DEFAULT_BODY = [
  "Battue le {date} à {heure}.",
  "Venez-vous ? Répondez par SMS : OUI ou NON.",
  "{#plusieurs}Plusieurs battues en cours : ajoutez le jour, ex. OUI {jour}{/plusieurs}",
  "Ou répondez ici : {lien}",
  "Réponse avant le {limite}.",
].join("\n");

const ANSWER_ROUTES_LABEL = "/api/diane/r/";

migrate(
  (app) => {
    const invitations = app.findCollectionByNameOrId("invitations");
    for (const name of ["sms_status", "email_status"]) {
      invitations.fields.add(
        new SelectField({
          name,
          maxSelect: 1,
          values: ["sent", "failed", "skipped"],
        }),
      );
    }
    app.save(invitations);

    const templates = app.findRecordsByFilter(
      "message_templates",
      "body = {:body}",
      "",
      0,
      0,
      { body: PREVIOUS_DEFAULT_BODY },
    );
    for (const template of templates) {
      if (!template) continue;
      template.set("body", DEFAULT_BODY);
      app.save(template);
    }

    const settings = app.settings();
    settings.rateLimits.enabled = true;
    settings.rateLimits.rules = [
      ...settings.rateLimits.rules.filter(
        (rule) => rule.label !== ANSWER_ROUTES_LABEL,
      ),
      // A member opens the page and answers: a few requests. Tokens are
      // unguessable anyway; this only slows down abuse.
      /** @type {core.RateLimitRule} */ ({
        label: ANSWER_ROUTES_LABEL,
        audience: "@guest",
        duration: 10,
        maxRequests: 20,
      }),
    ];
    app.save(settings);
  },
  (app) => {
    const invitations = app.findCollectionByNameOrId("invitations");
    invitations.fields.removeByName("sms_status");
    invitations.fields.removeByName("email_status");
    app.save(invitations);

    const templates = app.findRecordsByFilter(
      "message_templates",
      "body = {:body}",
      "",
      0,
      0,
      { body: DEFAULT_BODY },
    );
    for (const template of templates) {
      if (!template) continue;
      template.set("body", PREVIOUS_DEFAULT_BODY);
      app.save(template);
    }

    const settings = app.settings();
    settings.rateLimits.rules = settings.rateLimits.rules.filter(
      (rule) => rule.label !== ANSWER_ROUTES_LABEL,
    );
    app.save(settings);
  },
);
