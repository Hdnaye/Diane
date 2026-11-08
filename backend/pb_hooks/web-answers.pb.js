/// <reference path="../pb_data/types.d.ts" />

// Members' answers through their personal link ({DIANE_PUBLIC_URL}/r/{token},
// a page of the app calling these routes). Public: the invitation token is
// the only key; an unknown token gets the same 404 as a malformed one. The
// answers show the hunt, the deadline and the member's own answer, nothing
// personal. Rate limited per IP (migration 1762500600_invitation_sending.js).

// What the answer page shows.
routerAdd("GET", "/api/diane/r/{token}", (e) => {
  const lib = /** @type {typeof import("./lib/invitations.cjs")} */ (
    require(`${__hooks}/lib/invitations.cjs`)
  );
  const token = e.request?.pathValue("token") ?? "";
  /** @type {core.Record} */
  let invitation;
  try {
    if (!/^[A-Za-z0-9]{32,64}$/.test(token)) throw new Error("malformed");
    invitation = e.app.findFirstRecordByData("invitations", "token", token);
  } catch {
    throw new NotFoundError();
  }
  const hunt = e.app.findRecordById("hunts", invitation.getString("hunt"));
  return e.json(
    200,
    lib.publicAnswerView(
      {
        date: hunt.getString("date"),
        meeting_time: hunt.getString("meeting_time"),
        response_deadline: hunt.getString("response_deadline"),
        status: hunt.getString("status"),
      },
      { participation: invitation.getString("participation") },
      new Date(),
    ),
  );
});

// Records the answer, { "answer": "yes" | "no" }, until the deadline. A yes
// takes a free place or joins the waiting list; the head count is read and
// written in one transaction (serialized: never more than the maximum).
routerAdd("POST", "/api/diane/r/{token}", (e) => {
  const lib = /** @type {typeof import("./lib/invitations.cjs")} */ (
    require(`${__hooks}/lib/invitations.cjs`)
  );
  const { participationAfterAnswer } =
    /** @type {typeof import("./lib/waiting-list.cjs")} */ (
      require(`${__hooks}/lib/waiting-list.cjs`)
    );
  const token = e.request?.pathValue("token") ?? "";
  if (!/^[A-Za-z0-9]{32,64}$/.test(token)) throw new NotFoundError();
  const answer = e.requestInfo().body.answer;
  if (answer !== "yes" && answer !== "no") {
    throw new BadRequestError("Réponse invalide.", {
      answer: new ValidationError("invalid_answer", "Must be yes or no."),
    });
  }

  const now = new Date();
  /** @type {ReturnType<typeof lib.publicAnswerView> | undefined} */
  let view;
  e.app.runInTransaction((txApp) => {
    /** @type {core.Record} */
    let invitation;
    try {
      invitation = txApp.findFirstRecordByData("invitations", "token", token);
    } catch {
      throw new NotFoundError();
    }
    const hunt = txApp.findRecordById("hunts", invitation.getString("hunt"));
    const huntFields = {
      date: hunt.getString("date"),
      meeting_time: hunt.getString("meeting_time"),
      response_deadline: hunt.getString("response_deadline"),
      status: hunt.getString("status"),
    };
    const refusal = lib.answerRefusal(huntFields, now);
    if (refusal) {
      throw new ApiError(409, refusal.message, {
        answer: new ValidationError(refusal.code, refusal.message),
      });
    }

    const others = txApp
      .findRecordsByFilter(
        "invitations",
        "hunt = {:hunt} && id != {:id}",
        "",
        0,
        0,
        { hunt: hunt.id, id: invitation.id },
      )
      .map((other) => other?.getString("participation"));
    const current = invitation.getString("participation");
    const next = participationAfterAnswer({
      current,
      answer,
      maxParticipants: hunt.getInt("max_participants"),
      presentCount: others.filter((p) => p === "present").length,
      waitingCount: others.filter((p) => p === "waiting_list").length,
    });
    // An unchanged answer keeps its time: the waiting list order.
    if (next !== current) {
      invitation.set("participation", next);
      invitation.set("answered_at", new DateTime());
      invitation.set("answered_via", "web");
      txApp.save(invitation);
    }
    view = lib.publicAnswerView(huntFields, { participation: next }, now);
  });
  return e.json(200, view);
});

// Head count of a hunt and its waiting list (organizer only). A withdrawal
// promotes nobody: the organizer decides (rule to be defined, CLAUDE.md).
routerAdd(
  "GET",
  "/api/diane/hunts/{id}/attendance",
  (e) => {
    const { attendance } =
      /** @type {typeof import("./lib/waiting-list.cjs")} */ (
        require(`${__hooks}/lib/waiting-list.cjs`)
      );
    /** @type {core.Record} */
    let hunt;
    try {
      hunt = e.app.findRecordById("hunts", e.request?.pathValue("id") ?? "");
    } catch {
      throw new NotFoundError("Hunt not found.");
    }
    const invitations = e.app
      .findRecordsByFilter("invitations", "hunt = {:hunt}", "", 0, 0, {
        hunt: hunt.id,
      })
      .filter((invitation) => invitation !== undefined)
      .map((invitation) => ({
        id: invitation.id,
        participation: invitation.getString("participation"),
        answered_at: invitation.getString("answered_at"),
      }));
    return e.json(
      200,
      attendance(invitations, hunt.getInt("max_participants")),
    );
  },
  $apis.requireAuth("organizers"),
);
