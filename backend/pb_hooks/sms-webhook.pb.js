/// <reference path="../pb_data/types.d.ts" />

// POST /api/diane/sms/webhook (public, signed): SMS received by the gateway
// phone, sent by SMS Gateway for Android (`sms:received` webhook).
// Authentication: the app signs each request with its signing key
// (Settings > Webhooks > Signing Key), HMAC-SHA256 of the raw body followed
// by the X-Timestamp header (Unix seconds), hex, in X-Signature. The key is
// DIANE_SMS_WEBHOOK_SECRET; the signature is compared in constant time and
// the timestamp must be within 5 minutes (no replay). Any failure: the
// same 401 without detail; no secret configured: every request refused.
// Handling (one transaction, then the confirmation SMS):
// - a webhook sent again (same event id) is handled once (`sms_inbound`);
// - an SMS from the gateway's own number is ignored;
// - unknown or inactive sender, unrecognized message (lib/sms-reply.cjs),
//   no single open invitation for it, deadline passed: queued in
//   `sms_review_queue` with its reason (and member when known), no answer
//   sent (see README);
// - else the answer is recorded like a web answer (shared/answers.cjs,
//   answered_via: sms) and confirmed by SMS; a cancelled hunt gets "La
//   battue du ... est annulée.". At most MAX_CONFIRMATIONS_PER_HOUR
//   confirmations per member and hour (no loop with an answering machine).
// Logs carry ids and outcomes only: never a phone number or a message.

routerAdd("POST", "/api/diane/sms/webhook", (e) => {
  const inbound = /** @type {typeof import("./lib/sms-inbound.cjs")} */ (
    require(`${__hooks}/lib/sms-inbound.cjs`)
  );
  const { parseSmsReply } =
    /** @type {typeof import("./lib/sms-reply.cjs")} */ (
      require(`${__hooks}/lib/sms-reply.cjs`)
    );
  const { normalizeFrenchPhone } =
    /** @type {typeof import("./lib/phone.cjs")} */ (
      require(`${__hooks}/lib/phone.cjs`)
    );
  const { confirmationSms } =
    /** @type {typeof import("./lib/notifications.cjs")} */ (
      require(`${__hooks}/lib/notifications.cjs`)
    );
  const { toPocketBaseDate } =
    /** @type {typeof import("./lib/invitations.cjs")} */ (
      require(`${__hooks}/lib/invitations.cjs`)
    );
  const { applyAnswer, huntFields } =
    /** @type {typeof import("./shared/answers.cjs")} */ (
      require(`${__hooks}/shared/answers.cjs`)
    );
  const { appTransports } =
    /** @type {typeof import("./shared/messaging.cjs")} */ (
      require(`${__hooks}/shared/messaging.cjs`)
    );
  const { deliver } = /** @type {typeof import("./lib/transports.cjs")} */ (
    require(`${__hooks}/lib/transports.cjs`)
  );

  const now = new Date();
  const logger = e.app.logger();

  // --- Authentication: same refusal whatever the reason.
  const secret = $os.getenv("DIANE_SMS_WEBHOOK_SECRET").trim();
  const timestamp = e.request?.header.get("X-Timestamp") ?? "";
  const signature = (e.request?.header.get("X-Signature") ?? "").toLowerCase();
  const raw = toString(e.request?.body, 64 * 1024);
  if (!secret) {
    logger.warn("SMS webhook refused: DIANE_SMS_WEBHOOK_SECRET not set");
  }
  if (
    !secret ||
    !inbound.timestampFresh(timestamp, now) ||
    !/^[0-9a-f]{64}$/.test(signature) ||
    !$security.equal($security.hs256(raw + timestamp, secret), signature)
  ) {
    throw new UnauthorizedError("Unauthorized.");
  }

  const event = inbound.parseWebhookEvent(raw);
  if (!event) throw new BadRequestError("Invalid webhook.");
  if (event.event !== "sms:received") {
    return e.json(200, { status: "ignored" });
  }
  // The event id is the same on every retry; without one, the body is.
  const eventId = event.eventId || $security.sha256(raw);

  /** @type {string} */
  let status = "";
  /** @type {{ inboundId: string, memberId: string, phone: string, text: string }[]} */
  const confirmations = [];

  e.app.runInTransaction((txApp) => {
    try {
      txApp.findFirstRecordByData("sms_inbound", "event_id", eventId);
      status = "duplicate";
      return;
    } catch {
      // Not handled yet.
    }
    const record = new Record(txApp.findCollectionByNameOrId("sms_inbound"));
    record.set("event_id", eventId);

    const phone = normalizeFrenchPhone(event.sender);
    /**
     * @param {string} reason
     * @param {string} memberId
     */
    const toCheck = (reason, memberId) => {
      const item = new Record(
        txApp.findCollectionByNameOrId("sms_review_queue"),
      );
      item.set(
        "from_phone",
        (phone ?? event.sender.trim()).slice(0, 32) || "?",
      );
      item.set("body", event.text.slice(0, 2000) || "(message vide)");
      item.set("received_at", new DateTime());
      item.set("reason", reason);
      item.set("member", memberId);
      txApp.save(item);
      record.set("outcome", "review");
      status = "review";
    };

    if (
      inbound.isOwnNumber(event.sender, [
        event.recipient,
        $os.getenv("DIANE_SMS_GATEWAY_PHONE"),
      ])
    ) {
      record.set("outcome", "ignored");
      status = "ignored";
      txApp.save(record);
      return;
    }

    /** @type {core.Record | null} */
    let member = null;
    if (phone) {
      try {
        member = txApp.findFirstRecordByData("members", "phone", phone);
      } catch {
        member = null;
      }
    }
    /** @type {string} */
    let text = "";
    if (!member) {
      toCheck("unknown_sender", "");
    } else {
      record.set("member", member.id);
      const reply = parseSmsReply(event.text);
      if (!member.getBool("active")) {
        toCheck("inactive_member", member.id);
      } else if (!reply) {
        toCheck("unrecognized", member.id);
      } else {
        const invitations = txApp
          .findRecordsByFilter("invitations", "member = {:member}", "", 0, 0, {
            member: member.id,
          })
          .filter((invitation) => invitation !== undefined);
        /** @type {Record<string, core.Record>} */
        const byId = {};
        const candidates = invitations.map((invitation) => {
          byId[invitation.id] = invitation;
          return {
            id: invitation.id,
            hunt: huntFields(
              txApp.findRecordById("hunts", invitation.getString("hunt")),
            ),
          };
        });
        const resolution = inbound.resolveSmsReply(reply, candidates, now);
        if (resolution.action === "review") {
          toCheck(resolution.reason, member.id);
        } else {
          const invitation = byId[resolution.invitationId];
          const hunt = huntFields(
            txApp.findRecordById("hunts", invitation.getString("hunt")),
          );
          if (resolution.action === "cancelled") {
            record.set("outcome", "cancelled");
            status = "cancelled";
            text = confirmationSms("cancelled", hunt);
          } else {
            const { plan } = applyAnswer(
              txApp,
              invitation,
              resolution.answer,
              "sms",
              now,
            );
            if (plan.ok) {
              record.set("outcome", "applied");
              status = "applied";
              text = confirmationSms(
                /** @type {"present" | "absent" | "waiting_list"} */ (
                  plan.participation
                ),
                hunt,
              );
            } else if (plan.refusal.code === "hunt_cancelled") {
              record.set("outcome", "cancelled");
              status = "cancelled";
              text = confirmationSms("cancelled", hunt);
            } else {
              toCheck(plan.refusal.code, member.id);
            }
          }
        }
      }
    }

    if (text && member) {
      const since = toPocketBaseDate(new Date(now.getTime() - 3600 * 1000));
      const recent = txApp.findRecordsByFilter(
        "sms_inbound",
        "member = {:member} && created >= {:since}" +
          " && (confirmation = 'sending' || confirmation = 'sent' || confirmation = 'failed')",
        "",
        0,
        0,
        { member: member.id, since },
      ).length;
      if (recent >= inbound.MAX_CONFIRMATIONS_PER_HOUR) {
        record.set("confirmation", "skipped");
        logger.warn("SMS confirmation capped", "member", member.id);
      } else {
        record.set("confirmation", "sending");
        txApp.save(record);
        confirmations.push({
          inboundId: record.id,
          memberId: member.id,
          phone: member.getString("phone"),
          text,
        });
        return;
      }
    }
    txApp.save(record);
  });

  logger.info("SMS received", "event", eventId, "status", status);

  for (const sent of confirmations) {
    const outcome = deliver(appTransports(e.app).sms, {
      to: sent.phone,
      text: sent.text,
    });
    if (outcome.status === "failed") {
      logger.warn(
        "SMS confirmation not sent",
        "member",
        sent.memberId,
        "error",
        outcome.error,
      );
    }
    try {
      const record = e.app.findRecordById("sms_inbound", sent.inboundId);
      record.set("confirmation", outcome.status);
      e.app.save(record);
    } catch {
      // Purged or member deleted meanwhile.
    }
  }

  return e.json(200, { status });
});
