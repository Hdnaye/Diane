/// <reference path="../../pb_data/types.d.ts" />

// Sending SMS / e-mails to members from hooks: the transports of this
// PocketBase app, and the claimed sending of one invitation's channels
// (invitation, reminder, cancellation notice), shared by the hooks.
// Unlike pb_hooks/lib/ (pure, unit tested), this module uses PocketBase's
// APIs ($os, $http...): it is covered by the integration tests. Hooks load
// it with require(`${__hooks}/shared/messaging.cjs`) inside their handlers.

const { transportConfig, createTransports, deliver } =
  /** @type {typeof import("../lib/transports.cjs")} */ (
    require(`${__hooks}/lib/transports.cjs`)
  );

/**
 * SMS and e-mail transports, from the environment variables and the admin
 * UI's SMTP settings.
 *
 * @param {core.App} app
 */
function appTransports(app) {
  const outboxDir = $os.getenv("DIANE_FAKE_OUTBOX_DIR");
  const settings = app.settings();
  return createTransports(
    transportConfig((name) => $os.getenv(name)),
    {
      httpSend: (request) => ({ statusCode: $http.send(request).statusCode }),
      mailSend: (message) =>
        app.newMailClient().send(new MailerMessage(message)),
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
}

/**
 * @typedef {object} ClaimedItem An invitation whose channels were claimed
 *   (status `sending`) in a transaction.
 * @property {string} id
 * @property {boolean} sms
 * @property {boolean} email
 * @property {string} claimed `updated` of the invitation once claimed.
 */

/**
 * @typedef {object} Messages
 * @property {string} sms GSM-7 text.
 * @property {{ subject: string, text: string }} email
 */

/**
 * @typedef {object} SendOptions
 * @property {{ sms: string, email: string }} fields Status fields, e.g.
 *   `sms_status` / `email_status`.
 * @property {(invitation: core.Record, member: core.Record) => Messages} compose
 * @property {string} label Kind of message in logs, e.g. "Invitation".
 */

/**
 * Sends the claimed channels of one invitation and records each outcome.
 * Just before sending a channel, its `sending` status is refreshed (so
 * `updated`: a long batch is never seen as abandoned by resend-failed), in
 * a transaction that checks the invitation is still as this request left
 * it; taken over meanwhile (by resend-failed, or changed by the organizer),
 * its remaining channels are left alone (status "" in the result: not
 * counted). An error (e.g. member deleted) records the claimed channels not
 * sent yet as failed. Logs carry ids only.
 *
 * @param {core.App} app
 * @param {ReturnType<typeof appTransports>} transports
 * @param {ClaimedItem} item
 * @param {SendOptions} options
 * @returns {{ sms_status: string, email_status: string }}
 */
function sendClaimed(app, transports, item, { fields, compose, label }) {
  /** @type {{ sms_status: string, email_status: string }} */
  const result = { sms_status: "", email_status: "" };
  /** @param {"sms" | "email"} channel */
  const key = (channel) => (channel === "sms" ? "sms_status" : "email_status");
  let expected = item.claimed;
  try {
    const invitation = app.findRecordById("invitations", item.id);
    const member = app.findRecordById(
      "members",
      invitation.getString("member"),
    );
    const messages = compose(invitation, member);
    for (const channel of /** @type {const} */ (["sms", "email"])) {
      if (!item[channel]) continue;
      const field = fields[channel];
      let ours = false;
      app.runInTransaction((txApp) => {
        const current = txApp.findRecordById("invitations", item.id);
        if (
          current.getString(field) !== "sending" ||
          current.getString("updated") !== expected
        ) {
          return;
        }
        current.set(field, "sending");
        txApp.save(current);
        expected = current.getString("updated");
        ours = true;
      });
      if (!ours) {
        app
          .logger()
          .warn(
            `${label} taken over`,
            "invitation",
            item.id,
            "channel",
            channel,
          );
        return result;
      }
      const outcome =
        channel === "sms"
          ? deliver(transports.sms, {
              to: member.getString("phone"),
              text: messages.sms,
            })
          : deliver(transports.email, {
              to: member.getString("email"),
              subject: messages.email.subject,
              text: messages.email.text,
            });
      if (outcome.status === "failed") {
        app
          .logger()
          .warn(
            `${label} not sent`,
            "invitation",
            item.id,
            "channel",
            channel,
            "error",
            outcome.error,
          );
      }
      result[key(channel)] = outcome.status;
      const current = app.findRecordById("invitations", item.id);
      current.set(field, outcome.status);
      app.save(current);
      expected = current.getString("updated");
    }
    return result;
  } catch {
    app.logger().warn(`${label} sending error`, "invitation", item.id);
    /** @type {("sms" | "email")[]} */
    const unsent = /** @type {const} */ (["sms", "email"]).filter(
      (channel) => item[channel] && !result[key(channel)],
    );
    for (const channel of unsent) result[key(channel)] = "failed";
    try {
      const invitation = app.findRecordById("invitations", item.id);
      for (const channel of unsent) invitation.set(fields[channel], "failed");
      app.save(invitation);
    } catch {
      // Deleted: nothing left to record.
    }
    return result;
  }
}

module.exports = { appTransports, sendClaimed };
