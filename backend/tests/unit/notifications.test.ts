import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  confirmationSms,
  reminderMessages,
  cancellationMessages,
  reminderDue,
  REMINDER_BEFORE_DEADLINE_MS,
} =
  require("../../pb_hooks/lib/notifications.cjs") as typeof import("../../pb_hooks/lib/notifications.cjs");
const { smsSegments } =
  require("../../pb_hooks/lib/sms-encoding.cjs") as typeof import("../../pb_hooks/lib/sms-encoding.cjs");

const HUNT = {
  date: "2026-11-14",
  meeting_time: "08:00",
  response_deadline: "2026-11-12 19:00:00.000Z",
  status: "invitations_sent",
};

/** Every day of a year, with the longest time and deadline labels. */
const LONGEST_HUNTS = Array.from({ length: 366 }, (_, i) => {
  const day = new Date(Date.UTC(2028, 0, 1 + i)).toISOString().slice(0, 10);
  return {
    date: day,
    meeting_time: "23:30",
    // A Wednesday 30 September at 23:30 Paris: the longest deadline label.
    response_deadline: "2026-09-30 21:30:00.000Z",
    status: "invitations_sent",
  };
});

describe("confirmationSms", () => {
  it("confirms a yes with the hunt's day and the deadline to change it", () => {
    expect(confirmationSms("present", HUNT)).toBe(
      "Présence OUI enregistrée pour la battue du samedi 14 novembre. Modifiable jusqu'au jeudi 12 novembre à 20h00.",
    );
  });

  it("confirms a no", () => {
    expect(confirmationSms("absent", HUNT)).toBe(
      "Absence enregistrée pour la battue du samedi 14 novembre. Modifiable jusqu'au jeudi 12 novembre à 20h00.",
    );
  });

  it("tells about the waiting list", () => {
    expect(confirmationSms("waiting_list", HUNT)).toBe(
      "Vous etes sur liste d'attente pour la battue du samedi 14 novembre. Modifiable jusqu'au jeudi 12 novembre à 20h00.",
    );
  });

  it("tells about a cancelled hunt", () => {
    expect(confirmationSms("cancelled", HUNT)).toBe(
      "La battue du samedi 14 novembre est annulée.",
    );
  });

  it("leaves the deadline out without one", () => {
    expect(confirmationSms("present", { ...HUNT, response_deadline: "" })).toBe(
      "Présence OUI enregistrée pour la battue du samedi 14 novembre.",
    );
  });

  it("is GSM-7 (transliterated) and fits 1 SMS for every date", () => {
    expect(
      confirmationSms("waiting_list", { ...HUNT, date: "2026-08-15" }),
    ).toBe(
      "Vous etes sur liste d'attente pour la battue du samedi 15 aout. Modifiable jusqu'au jeudi 12 novembre à 20h00.",
    );
    for (const hunt of LONGEST_HUNTS) {
      for (const outcome of [
        "present",
        "absent",
        "waiting_list",
        "cancelled",
      ] as const) {
        const text = confirmationSms(outcome, hunt);
        expect(smsSegments(text), text).toMatchObject({
          encoding: "GSM-7",
          segments: 1,
        });
      }
    }
  });
});

describe("reminderMessages", () => {
  const link = "https://diane.example.org/r/abc";

  it("reminds by SMS with the day to answer, without the link", () => {
    expect(reminderMessages(HUNT, link).sms).toBe(
      "Rappel : battue du samedi 14 novembre à 8h00. Répondez par SMS OUI 14 ou NON 14 avant le jeudi 12 novembre à 20h00.",
    );
  });

  it("reminds by e-mail with the link and accents", () => {
    expect(
      reminderMessages({ ...HUNT, date: "2026-08-15" }, link).email,
    ).toStrictEqual({
      subject: "Rappel : battue du samedi 15 août",
      text:
        "Rappel : battue du samedi 15 août à 8h00.\n" +
        "Vous n'avez pas encore répondu. Répondez ici avant le jeudi 12 novembre à 20h00 :\n" +
        link,
    });
  });

  it("fits 1 SMS (GSM-7) for every date", () => {
    for (const hunt of LONGEST_HUNTS) {
      const text = reminderMessages(hunt, link).sms;
      expect(smsSegments(text), text).toMatchObject({
        encoding: "GSM-7",
        segments: 1,
      });
    }
  });
});

describe("cancellationMessages", () => {
  it("tells the hunt is cancelled, by SMS and e-mail", () => {
    expect(cancellationMessages(HUNT)).toStrictEqual({
      sms: "La battue du samedi 14 novembre à 8h00 est annulée.",
      email: {
        subject: "Battue du samedi 14 novembre annulée",
        text: "La battue du samedi 14 novembre à 8h00 est annulée.",
      },
    });
  });

  it("fits 1 SMS (GSM-7) for every date", () => {
    for (const hunt of LONGEST_HUNTS) {
      const text = cancellationMessages(hunt).sms;
      expect(smsSegments(text), text).toMatchObject({
        encoding: "GSM-7",
        segments: 1,
      });
    }
  });
});

describe("reminderDue", () => {
  const DEADLINE = new Date("2026-11-12T19:00:00.000Z");
  const due = (fields: Record<string, string>, now: Date) =>
    reminderDue(
      {
        ...HUNT,
        invitations_sent_at: "2026-11-08 10:00:00.000Z",
        reminder_sent_at: "",
        ...fields,
      },
      now,
    );
  const at = (offsetMs: number) => new Date(DEADLINE.getTime() + offsetMs);

  it("is due from 24 hours before the deadline until the deadline", () => {
    expect(REMINDER_BEFORE_DEADLINE_MS).toBe(24 * 60 * 60 * 1000);
    expect(due({}, at(-REMINDER_BEFORE_DEADLINE_MS - 1))).toBe(false);
    expect(due({}, at(-REMINDER_BEFORE_DEADLINE_MS))).toBe(true);
    expect(due({}, at(-1000))).toBe(true);
    expect(due({}, at(0))).toBe(false);
  });

  it("is sent once", () => {
    expect(
      due({ reminder_sent_at: "2026-11-11 19:00:00.000Z" }, at(-3600_000)),
    ).toBe(false);
  });

  it.each(["draft", "cancelled", "closed"])(
    "is not due for a %s hunt",
    (status) => {
      expect(due({ status }, at(-3600_000))).toBe(false);
    },
  );

  it("is not due without deadline", () => {
    expect(due({ response_deadline: "" }, at(-3600_000))).toBe(false);
  });

  it("is not due when invitations were sent less than 24 hours before the deadline", () => {
    expect(
      due({ invitations_sent_at: "2026-11-11 20:00:00.000Z" }, at(-3600_000)),
    ).toBe(false);
    expect(due({ invitations_sent_at: "" }, at(-3600_000))).toBe(false);
  });
});
