/// <reference path="../../pb_data/types.d.ts" />

// Records a member's answer to an invitation, the same way for the web
// link (answered_via: web) and SMS replies (answered_via: sms): refused
// after the deadline or for a cancelled / closed hunt, else a yes takes a
// free place or joins the waiting list (planAnswer in lib/invitations.cjs).
// To be called inside a transaction (runInTransaction), so that the head
// count is read and written atomically: never more than the maximum.

const lib = /** @type {typeof import("../lib/invitations.cjs")} */ (
  require(`${__hooks}/lib/invitations.cjs`)
);

/**
 * @param {core.Record} hunt
 * @returns {import("../lib/invitations.cjs").Hunt}
 */
function huntFields(hunt) {
  return {
    date: hunt.getString("date"),
    meeting_time: hunt.getString("meeting_time"),
    response_deadline: hunt.getString("response_deadline"),
    status: hunt.getString("status"),
  };
}

/**
 * @param {core.App} txApp Transaction app.
 * @param {core.Record} invitation Read through txApp.
 * @param {"yes" | "no"} answer
 * @param {"web" | "sms"} via
 * @param {Date} now
 * @returns {{ hunt: import("../lib/invitations.cjs").Hunt, plan: import("../lib/invitations.cjs").AnswerPlan }}
 */
function applyAnswer(txApp, invitation, answer, via, now) {
  const hunt = txApp.findRecordById("hunts", invitation.getString("hunt"));
  const fields = huntFields(hunt);
  const others = txApp
    .findRecordsByFilter(
      "invitations",
      "hunt = {:hunt} && id != {:id}",
      "",
      0,
      0,
      { hunt: hunt.id, id: invitation.id },
    )
    .map((other) => other?.getString("participation") ?? "");
  const plan = lib.planAnswer(
    {
      hunt: { ...fields, max_participants: hunt.getInt("max_participants") },
      current: invitation.getString("participation"),
      others,
      answer,
    },
    now,
  );
  // An unchanged answer keeps its time: the waiting list order.
  if (plan.ok && plan.changed) {
    invitation.set("participation", plan.participation);
    invitation.set("answered_at", new DateTime());
    invitation.set("answered_via", via);
    txApp.save(invitation);
  }
  return { hunt: fields, plan };
}

module.exports = { huntFields, applyAnswer };
