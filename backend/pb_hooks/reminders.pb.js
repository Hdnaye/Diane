/// <reference path="../pb_data/types.d.ts" />

// Reminder of members who have not answered (CLAUDE.md), every 10 minutes:
// from 24 hours before the response deadline (reminderDue in
// lib/notifications.cjs), the invitations still `pending` of active members
// of hunts whose invitations were sent (not cancelled or closed) get a
// short SMS / e-mail, once (`reminder_sent_at` on the hunt). Same
// mechanics as the invitations: channels claimed `sending` in a
// transaction (reminder_sms_status / reminder_email_status), then sent and
// recorded; until the deadline, each run sends again the reminders failed
// or not sent (gateway unreachable during the run) or left `sending` by an
// interrupted run (gateway phone off, restart), at most 3 attempts per
// channel (noticeChannelsToSend, noticeRecord). A resent SMS keeps its
// gateway id (`rem-<invitation id>`): one the slow phone took after the
// timeout is rejected as a duplicate (409), counted as sent.
// Logs carry ids only.

// Schedule: every 10 minutes, or DIANE_REMINDER_SCHEDULE (cron expression,
// e.g. for tests that trigger the runs themselves).
cronAdd(
  "dianeReminders",
  $os.getenv("DIANE_REMINDER_SCHEDULE").trim() || "*/10 * * * *",
  () => {
    const lib = /** @type {typeof import("./lib/invitations.cjs")} */ (
      require(`${__hooks}/lib/invitations.cjs`)
    );
    const {
      reminderDue,
      reminderMessages,
      noticeChannelsToSend,
      sendingOrder,
    } = /** @type {typeof import("./lib/notifications.cjs")} */ (
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

    // $app is the app itself here (typed as the PocketBase wrapper).
    const app = /** @type {core.App} */ (/** @type {unknown} */ ($app));
    const now = new Date();
    const publicUrl = $os.getenv("DIANE_PUBLIC_URL");
    const bootedAt = String(app.store().get("diane.bootedAt") ?? "");
    const hunts = app.findRecordsByFilter(
      "hunts",
      "status = 'invitations_sent' && response_deadline != ''" +
        " && response_deadline > {:now}",
      "date",
      0,
      0,
      { now: lib.toPocketBaseDate(now) },
    );
    /** @type {ReturnType<typeof appTransports> | null} */
    let transports = null;

    for (const found of hunts) {
      if (!found) continue;
      /** @type {(import("./shared/messaging.cjs").ClaimedItem & { attempts: number })[]} */
      const toSend = [];
      app.runInTransaction((txApp) => {
        const hunt = txApp.findRecordById("hunts", found.id);
        const due = reminderDue(
          {
            ...huntFields(hunt),
            invitations_sent_at: hunt.getString("invitations_sent_at"),
            reminder_sent_at: hunt.getString("reminder_sent_at"),
          },
          now,
        );
        if (!due && !hunt.getString("reminder_sent_at")) return;
        if (due) {
          hunt.set("reminder_sent_at", new DateTime());
          txApp.save(hunt);
        }
        const context = {
          // First run: every pending invitation; later runs: only the
          // failed or interrupted reminders (not members invited since).
          huntSent: due,
          bootedAt: bootedAt ? new Date(bootedAt) : null,
          now,
        };
        const pending = txApp.findRecordsByFilter(
          "invitations",
          "hunt = {:hunt} && participation = 'pending' && member.active = true",
          "created",
          0,
          0,
          { hunt: hunt.id },
        );
        for (const invitation of pending) {
          if (!invitation) continue;
          const smsAttempts = invitation.getInt("reminder_sms_attempts");
          const emailAttempts = invitation.getInt("reminder_email_attempts");
          const channels = noticeChannelsToSend(
            {
              sms_status: invitation.getString("reminder_sms_status"),
              email_status: invitation.getString("reminder_email_status"),
              sms_attempts: smsAttempts,
              email_attempts: emailAttempts,
              updated: invitation.getString("updated"),
            },
            context,
          );
          if (!channels.sms && !channels.email) continue;
          if (channels.sms) invitation.set("reminder_sms_status", "sending");
          if (channels.email)
            invitation.set("reminder_email_status", "sending");
          txApp.save(invitation);
          toSend.push({
            id: invitation.id,
            ...channels,
            claimed: invitation.getString("updated"),
            attempts: smsAttempts + emailAttempts,
          });
        }
      });
      if (toSend.length === 0) continue;

      const fields = huntFields(app.findRecordById("hunts", found.id));
      transports = transports ?? appTransports(app);
      // Least attempted first, random otherwise: a slow gateway (the rest of
      // a run is cut off after a timeout) never keeps hitting the same member.
      const results = sendingOrder(toSend).map((item) =>
        sendClaimed(
          app,
          /** @type {NonNullable<typeof transports>} */ (transports),
          item,
          {
            fields: {
              sms: "reminder_sms_status",
              email: "reminder_email_status",
            },
            attempts: {
              sms: "reminder_sms_attempts",
              email: "reminder_email_attempts",
            },
            compose: (invitation) =>
              reminderMessages(
                fields,
                lib.answerLink(publicUrl, invitation.getString("token")) ?? "",
              ),
            label: "Reminder",
            idPrefix: "rem",
          },
        ),
      );
      const { sms, email } = lib.sendSummary(results);
      app
        .logger()
        .info(
          "Reminders sent",
          "hunt",
          found.id,
          "sms",
          sms.sent,
          "email",
          email.sent,
          "failed",
          sms.failed + email.failed,
        );
    }
  },
);
