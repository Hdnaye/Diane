// Places of a hunt and its waiting list. A yes is present while places are
// free (max_participants 0: no limit), else on the waiting list, ordered by
// answer time. A withdrawal frees a place but promotes nobody: the rule is to
// be defined with the organizer (CLAUDE.md), who sees the state through
// attendance(). Meanwhile a freed place is not given to a newcomer ahead of
// members already waiting.
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/waiting-list.cjs`)
// and by Vitest with createRequire.

/**
 * @typedef {"pending" | "present" | "waiting_list" | "absent"} Participation
 */

/**
 * @typedef {object} AnswerContext
 * @property {string} current          Current participation of the member.
 * @property {"yes" | "no"} answer
 * @property {number} maxParticipants  0: no limit.
 * @property {number} presentCount     Other members present.
 * @property {number} waitingCount     Other members on the waiting list.
 */

/**
 * Participation of a member after an answer. A repeated yes keeps the
 * current place (present or waiting list): nobody loses or gains a place by
 * answering twice.
 *
 * @param {AnswerContext} context
 * @returns {Participation}
 */
function participationAfterAnswer({
  current,
  answer,
  maxParticipants,
  presentCount,
  waitingCount,
}) {
  if (answer === "no") return "absent";
  if (current === "present" || current === "waiting_list") return current;
  const placeFree = !maxParticipants || presentCount < maxParticipants;
  return placeFree && waitingCount === 0 ? "present" : "waiting_list";
}

/**
 * @typedef {object} AttendanceInvitation
 * @property {string} id
 * @property {string} participation
 * @property {string} answered_at PocketBase UTC datetime, or "".
 */

/**
 * @typedef {object} Attendance
 * @property {number} present
 * @property {string[]} waiting_list Invitation ids, first come first.
 * @property {number} absent
 * @property {number} pending
 * @property {number} max_participants 0: no limit.
 * @property {number | null} free_places null without limit.
 */

/**
 * Head count of a hunt.
 *
 * @param {AttendanceInvitation[]} invitations
 * @param {number} maxParticipants 0: no limit.
 * @returns {Attendance}
 */
function attendance(invitations, maxParticipants) {
  /** @param {string} participation */
  const count = (participation) =>
    invitations.filter((item) => item.participation === participation).length;
  const present = count("present");
  const waiting = invitations
    .filter((item) => item.participation === "waiting_list")
    .sort((a, b) =>
      a.answered_at === b.answered_at
        ? a.id < b.id
          ? -1
          : 1
        : a.answered_at < b.answered_at
          ? -1
          : 1,
    );
  return {
    present,
    waiting_list: waiting.map((item) => item.id),
    absent: count("absent"),
    pending: count("pending"),
    max_participants: maxParticipants || 0,
    free_places: maxParticipants
      ? Math.max(0, maxParticipants - present)
      : null,
  };
}

module.exports = { participationAfterAnswer, attendance };
