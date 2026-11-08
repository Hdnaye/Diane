/// <reference path="../pb_data/types.d.ts" />

// POST /api/diane/hunts/{id}/send-invitations (organizer only): invites
// every active member not yet invited to the hunt, by SMS (phone) and
// e-mail, with the default template and each member's answer link
// ({DIANE_PUBLIC_URL}/r/{token}). Idempotent: sending again only invites the
// new members. Invitations are created in a transaction, then sent; the
// outcome per channel is stored on each invitation (sms_status,
// email_status) and summed up in the answer. Logs carry ids only.
routerAdd(
  "POST",
  "/api/diane/hunts/{id}/send-invitations",
  (e) => {
    const lib = /** @type {typeof import("./lib/invitations.cjs")} */ (
      require(`${__hooks}/lib/invitations.cjs`)
    );
    const { transportConfig, createTransports, deliver } =
      /** @type {typeof import("./lib/transports.cjs")} */ (
        require(`${__hooks}/lib/transports.cjs`)
      );

    /** @param {core.Record} hunt */
    const huntFields = (hunt) => ({
      date: hunt.getString("date"),
      meeting_time: hunt.getString("meeting_time"),
      response_deadline: hunt.getString("response_deadline"),
      status: hunt.getString("status"),
    });

    /**
     * Error whose reason is in data[field].code, e.g. data.hunt.code.
     * @param {number} status
     * @param {string} field
     * @param {string} code
     * @param {string} message
     */
    const refusal = (status, field, code, message) =>
      new ApiError(status, message, {
        [field]: new ValidationError(code, message),
      });

    const now = new Date();
    const huntId = e.request?.pathValue("id") ?? "";
    /** @type {core.Record} */
    let hunt;
    try {
      hunt = e.app.findRecordById("hunts", huntId);
    } catch {
      throw new NotFoundError("Hunt not found.");
    }

    const publicUrl = $os.getenv("DIANE_PUBLIC_URL");
    if (lib.answerLink(publicUrl, "token") === null) {
      throw refusal(
        503,
        "config",
        "public_url_missing",
        "DIANE_PUBLIC_URL is not configured.",
      );
    }
    /** @type {core.Record} */
    let template;
    try {
      template = e.app.findFirstRecordByFilter(
        "message_templates",
        "is_default = true",
      );
    } catch {
      throw refusal(
        409,
        "template",
        "no_default_template",
        "Aucun modèle de message par défaut.",
      );
    }

    // Invitations of new members, created in one transaction (concurrent
    // requests are serialized: nobody is invited twice).
    /** @type {string[]} */
    const created = [];
    e.app.runInTransaction((txApp) => {
      const current = txApp.findRecordById("hunts", huntId);
      const plan = lib.sendPlan(huntFields(current), now);
      if (!plan.ok) {
        throw refusal(409, "hunt", plan.code, plan.message);
      }
      if (plan.deadline) current.set("response_deadline", plan.deadline);
      if (current.getString("status") === "draft") {
        current.set("status", "invitations_sent");
      }
      if (!current.getString("invitations_sent_at")) {
        current.set("invitations_sent_at", new DateTime());
      }
      txApp.save(current);

      const invited = new Set(
        txApp
          .findRecordsByFilter("invitations", "hunt = {:hunt}", "", 0, 0, {
            hunt: huntId,
          })
          .map((invitation) => invitation?.getString("member")),
      );
      const collection = txApp.findCollectionByNameOrId("invitations");
      const members = txApp.findRecordsByFilter(
        "members",
        "active = true",
        "created",
        0,
        0,
      );
      for (const member of members) {
        if (!member || invited.has(member.id)) continue;
        const invitation = new Record(collection);
        invitation.set("hunt", huntId);
        invitation.set("member", member.id);
        txApp.save(invitation);
        created.push(invitation.id);
      }
    });
    hunt = e.app.findRecordById("hunts", huntId);

    const outboxDir = $os.getenv("DIANE_FAKE_OUTBOX_DIR");
    const settings = e.app.settings();
    const transports = createTransports(
      transportConfig((name) => $os.getenv(name)),
      {
        httpSend: (request) => ({
          statusCode: $http.send(request).statusCode,
        }),
        mailSend: (message) =>
          e.app.newMailClient().send(new MailerMessage(message)),
        record: (kind, message) =>
          $os.writeFile(
            `${outboxDir}/${kind}-${$security.randomString(24)}.json`,
            JSON.stringify(message),
            // Owner read/write only (goja passes the number as FileMode).
            /** @type {fs.FileMode} */ (/** @type {unknown} */ (0o600)),
          ),
        smtpEnabled: settings.smtp.enabled,
        defaultSender: {
          address: settings.meta.senderAddress,
          name: settings.meta.senderName,
        },
      },
    );

    /** @type {Record<string, ReturnType<typeof huntFields>>} */
    const hunts = {};
    /** @param {string} id */
    const huntOf = (id) => {
      if (!hunts[id]) hunts[id] = huntFields(e.app.findRecordById("hunts", id));
      return hunts[id];
    };

    const results = created.map((invitationId) => {
      const invitation = e.app.findRecordById("invitations", invitationId);
      const member = e.app.findRecordById(
        "members",
        invitation.getString("member"),
      );
      const open = e.app
        .findRecordsByFilter(
          "invitations",
          "member = {:member} && participation = 'pending'",
          "",
          0,
          0,
          { member: member.id },
        )
        .filter(
          (other) =>
            other &&
            lib.isOpenInvitation(
              { participation: other.getString("participation") },
              huntOf(other.getString("hunt")),
              now,
            ),
        );
      const messages = lib.invitationMessages({
        body: template.getString("body"),
        hunt: huntFields(hunt),
        link: /** @type {string} */ (
          lib.answerLink(publicUrl, invitation.getString("token"))
        ),
        several: open.length > 1,
      });

      const sms = deliver(transports.sms, {
        to: member.getString("phone"),
        text: messages.sms,
      });
      const email = deliver(transports.email, {
        to: member.getString("email"),
        subject: messages.email.subject,
        text: messages.email.text,
      });
      for (const [channel, outcome] of /** @type {const} */ ([
        ["sms", sms],
        ["email", email],
      ])) {
        if (outcome.status === "failed") {
          e.app
            .logger()
            .warn(
              "Invitation not sent",
              "invitation",
              invitationId,
              "channel",
              channel,
              "error",
              outcome.error,
            );
        }
      }
      invitation.set("sms_status", sms.status);
      invitation.set("email_status", email.status);
      e.app.save(invitation);
      return { sms_status: sms.status, email_status: email.status };
    });

    return e.json(200, lib.sendSummary(results));
  },
  $apis.requireAuth("organizers"),
);
