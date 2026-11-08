import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { participationAfterAnswer, attendance } =
  require("../../pb_hooks/lib/waiting-list.cjs") as typeof import("../../pb_hooks/lib/waiting-list.cjs");

describe("participationAfterAnswer", () => {
  const base = {
    current: "pending",
    maxParticipants: 3,
    presentCount: 0,
    waitingCount: 0,
  } as const;

  it("makes a yes present when a place is free", () => {
    expect(
      participationAfterAnswer({ ...base, answer: "yes", presentCount: 2 }),
    ).toBe("present");
  });

  it("puts a yes on the waiting list when the hunt is full", () => {
    expect(
      participationAfterAnswer({ ...base, answer: "yes", presentCount: 3 }),
    ).toBe("waiting_list");
  });

  it("never limits a hunt without maximum (0)", () => {
    expect(
      participationAfterAnswer({
        ...base,
        answer: "yes",
        maxParticipants: 0,
        presentCount: 500,
      }),
    ).toBe("present");
  });

  // A place freed by a withdrawal is not given to a newcomer ahead of the
  // waiting list: the withdrawal rule is up to the organizer (CLAUDE.md).
  it("keeps a freed place away from a newcomer while members wait", () => {
    expect(
      participationAfterAnswer({
        ...base,
        answer: "yes",
        presentCount: 2,
        waitingCount: 1,
      }),
    ).toBe("waiting_list");
  });

  it.each(["pending", "present", "waiting_list", "absent"] as const)(
    "makes a no absent (from %s)",
    (current) => {
      expect(participationAfterAnswer({ ...base, current, answer: "no" })).toBe(
        "absent",
      );
    },
  );

  it.each(["present", "waiting_list"] as const)(
    "keeps a repeated yes %s (no place lost or gained)",
    (current) => {
      expect(
        participationAfterAnswer({
          ...base,
          current,
          answer: "yes",
          presentCount: 3,
        }),
      ).toBe(current);
      expect(
        participationAfterAnswer({
          ...base,
          current,
          answer: "yes",
          presentCount: 0,
        }),
      ).toBe(current);
    },
  );

  it("treats a yes after a no like a new yes", () => {
    expect(
      participationAfterAnswer({
        ...base,
        current: "absent",
        answer: "yes",
        presentCount: 3,
      }),
    ).toBe("waiting_list");
  });
});

describe("attendance", () => {
  const invitation = (
    id: string,
    participation: string,
    answered_at = "",
  ) => ({ id, participation, answered_at });

  it("counts participations and orders the waiting list by answer time", () => {
    expect(
      attendance(
        [
          invitation("a", "present", "2026-11-01 10:00:00.000Z"),
          invitation("w2", "waiting_list", "2026-11-01 12:00:00.000Z"),
          invitation("b", "absent", "2026-11-01 09:00:00.000Z"),
          invitation("w1", "waiting_list", "2026-11-01 11:00:00.000Z"),
          invitation("c", "pending"),
          invitation("w0", "waiting_list", "2026-11-01 12:00:00.000Z"),
        ],
        2,
      ),
    ).toStrictEqual({
      present: 1,
      waiting_list: ["w1", "w0", "w2"],
      absent: 1,
      pending: 1,
      max_participants: 2,
      free_places: 1,
    });
  });

  it("has no free place count without maximum", () => {
    expect(attendance([invitation("a", "present")], 0)).toMatchObject({
      present: 1,
      max_participants: 0,
      free_places: null,
    });
  });

  it("never reports negative free places", () => {
    expect(
      attendance(
        [invitation("a", "present"), invitation("b", "present")],
        1,
      ).free_places,
    ).toBe(0);
  });
});
