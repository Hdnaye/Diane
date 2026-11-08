/// <reference path="../pb_data/types.d.ts" />

// POST /api/diane/hunts/{id}/cancel (organizer): the hunt becomes
// `cancelled` (`cancelled_at`: first cancellation) and every invited member
// who did not answer no (pending, present, waiting list) is told by SMS and
// e-mail (lib/notifications.cjs). Answers are kept as they were; later
// answers are refused (web: 409 hunt_cancelled, SMS: "La battue du ... est
// annulée."). Idempotent: the notices are claimed per channel
// (cancellation_sms_status / cancellation_email_status: sending, then
// sent / failed / skipped) in a transaction, like invitations; calling it
// again only resends the notices failed or left `sending` by an
// interrupted request. Answers { notified, sms: {...}, email: {...} }.

routerAdd(
  "POST",
  "/api/diane/hunts/{id}/cancel",
  (e) => {
    const lib = /** @type {typeof import("./lib/invitations.cjs")} */ (
      require(`${__hooks}/lib/invitations.cjs`)
    );
    const { cancellationMessages } =
      /** @type {typeof import("./lib/notifications.cjs")} */ (
        require(`${__hooks}/lib/notifications.cjs`)
      );
    const { appTransports, sendClaimed } =
      /** @type {typeof import("./shared/messaging.cjs")} */ (
        require(`${__hooks}/shared/messaging.cjs`)
      );
    const { huntFields } =
      /** @type {typeof import("./shared/answers.cjs")} */ (
        require(`${__hooks}/shared/answers.cjs`)
      );

    const now = new Date();
    const huntId = e.request?.pathValue("id") ?? "";
    try {
      e.app.findRecordById("hunts", huntId);
    } catch {
      throw new NotFoundError("Hunt not found.");
    }

    /** @type {import("./shared/messaging.cjs").ClaimedItem[]} */
    const toSend = [];
    e.app.runInTransaction((txApp) => {
      const hunt = txApp.findRecordById("hunts", huntId);
      if (hunt.getString("status") !== "cancelled") {
        hunt.set("status", "cancelled");
      }
      if (!hunt.getString("cancelled_at")) {
        hunt.set("cancelled_at", new DateTime());
      }
      txApp.save(hunt);

      const bootedAt = String(e.app.store().get("diane.bootedAt") ?? "");
      const context = {
        // A notice never sent (empty status) is sent.
        huntSent: true,
        bootedAt: bootedAt ? new Date(bootedAt) : null,
        now,
      };
      const invitations = txApp.findRecordsByFilter(
        "invitations",
        "hunt = {:hunt} && participation != 'absent'",
        "created",
        0,
        0,
        { hunt: huntId },
      );
      for (const invitation of invitations) {
        if (!invitation) continue;
        const channels = lib.channelsToResend(
          {
            sms_status: invitation.getString("cancellation_sms_status"),
            email_status: invitation.getString("cancellation_email_status"),
            updated: invitation.getString("updated"),
          },
          context,
        );
        if (!channels.sms && !channels.email) continue;
        if (channels.sms) invitation.set("cancellation_sms_status", "sending");
        if (channels.email) {
          invitation.set("cancellation_email_status", "sending");
        }
        txApp.save(invitation);
        toSend.push({
          id: invitation.id,
          ...channels,
          claimed: invitation.getString("updated"),
        });
      }
    });

    const messages = cancellationMessages(
      huntFields(e.app.findRecordById("hunts", huntId)),
    );
    const transports = appTransports(e.app);
    const results = toSend.map((item) =>
      sendClaimed(e.app, transports, item, {
        fields: {
          sms: "cancellation_sms_status",
          email: "cancellation_email_status",
        },
        compose: () => messages,
        label: "Cancellation notice",
      }),
    );
    const { invited, sms, email } = lib.sendSummary(results);
    e.app.logger().info("Hunt cancelled", "hunt", huntId, "notified", invited);
    return e.json(200, { notified: invited, sms, email });
  },
  $apis.requireAuth("organizers"),
);
