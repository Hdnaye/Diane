/// <reference path="../pb_data/types.d.ts" />

// Organizer only, same refusals and same answer for both routes:
// - POST /api/diane/hunts/{id}/send-invitations: invites every active member
//   not yet invited to the hunt, by SMS (phone) and e-mail, with the default
//   template and each member's answer link ({DIANE_PUBLIC_URL}/r/{token}).
//   Idempotent: sending again only invites the new members.
// - POST /api/diane/hunts/{id}/resend-failed: sends again, channel by
//   channel, the SMS / e-mails recorded as failed, left `sending` by an
//   interrupted request, or never sent, for the invitations still pending of
//   active members (channelsToResend in lib/invitations.cjs). Idempotent:
//   what was sent is not sent again.
// The channels to send are marked `sending` in a transaction (new
// invitations, or claimed ones), so that concurrent requests never send a
// message twice and an interrupted sending stays visible; then they are
// sent, each invitation on its own (an error on one does not stop the
// others), and the outcome per channel is stored on each invitation
// (sms_status, email_status) and summed up in the answer. Logs carry ids
// only.
// One handler for both routes: a handler cannot use code declared outside
// of it (each runs in its own JSVM context).

// Start of this PocketBase process: a `sending` older than that was
// interrupted by a restart.
onBootstrap((e) => {
  e.next();
  e.app.store().set("diane.bootedAt", new Date().toISOString());
});

for (const route of [
  "/api/diane/hunts/{id}/send-invitations",
  "/api/diane/hunts/{id}/resend-failed",
]) {
  routerAdd(
    "POST",
    route,
    (e) => {
      const lib = /** @type {typeof import("./lib/invitations.cjs")} */ (
        require(`${__hooks}/lib/invitations.cjs`)
      );
      const { appTransports, sendClaimed } =
        /** @type {typeof import("./shared/messaging.cjs")} */ (
          require(`${__hooks}/shared/messaging.cjs`)
        );

      const resending = (e.request?.url?.path ?? "").endsWith("/resend-failed");

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

      // Invitations and channels to send, chosen in one transaction
      // (concurrent requests are serialized: nothing is sent twice).
      /** @type {import("./shared/messaging.cjs").ClaimedItem[]} */
      const toSend = [];
      e.app.runInTransaction((txApp) => {
        const current = txApp.findRecordById("hunts", huntId);
        const plan = lib.sendPlan(huntFields(current), now);
        if (!plan.ok) {
          throw refusal(409, "hunt", plan.code, plan.message);
        }
        if (plan.deadline) current.set("response_deadline", plan.deadline);

        if (resending) {
          if (plan.deadline) txApp.save(current);
          const bootedAt = String(e.app.store().get("diane.bootedAt") ?? "");
          const context = {
            huntSent: current.getString("invitations_sent_at") !== "",
            bootedAt: bootedAt ? new Date(bootedAt) : null,
            now,
          };
          const pending = txApp.findRecordsByFilter(
            "invitations",
            "hunt = {:hunt} && participation = 'pending'" +
              " && member.active = true",
            "created",
            0,
            0,
            { hunt: huntId },
          );
          for (const invitation of pending) {
            if (!invitation) continue;
            const channels = lib.channelsToResend(
              {
                sms_status: invitation.getString("sms_status"),
                email_status: invitation.getString("email_status"),
                updated: invitation.getString("updated"),
              },
              context,
            );
            if (!channels.sms && !channels.email) continue;
            // Claimed: a concurrent request sees them as being sent.
            if (channels.sms) invitation.set("sms_status", "sending");
            if (channels.email) invitation.set("email_status", "sending");
            txApp.save(invitation);
            toSend.push({
              id: invitation.id,
              ...channels,
              claimed: invitation.getString("updated"),
            });
          }
          return;
        }

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
          invitation.set("sms_status", "sending");
          invitation.set("email_status", "sending");
          txApp.save(invitation);
          toSend.push({
            id: invitation.id,
            sms: true,
            email: true,
            claimed: invitation.getString("updated"),
          });
        }
      });
      hunt = e.app.findRecordById("hunts", huntId);

      const transports = appTransports(e.app);

      /** @type {Record<string, ReturnType<typeof huntFields>>} */
      const hunts = {};
      /** @param {string} id */
      const huntOf = (id) => {
        if (!hunts[id])
          hunts[id] = huntFields(e.app.findRecordById("hunts", id));
        return hunts[id];
      };

      /**
       * @param {core.Record} invitation
       * @param {core.Record} member
       */
      const compose = (invitation, member) => {
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
        return lib.invitationMessages({
          body: template.getString("body"),
          hunt: huntFields(hunt),
          link: /** @type {string} */ (
            lib.answerLink(publicUrl, invitation.getString("token"))
          ),
          several: open.length > 1,
        });
      };

      // Each invitation on its own: an error on one (e.g. its member
      // deleted meanwhile) does not stop the others.
      const results = toSend.map((item) =>
        sendClaimed(e.app, transports, item, {
          fields: { sms: "sms_status", email: "email_status" },
          compose,
          label: "Invitation",
          idPrefix: "inv",
        }),
      );

      return e.json(200, lib.sendSummary(results));
    },
    $apis.requireAuth("organizers"),
  );
}
