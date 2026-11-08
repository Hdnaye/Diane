import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { smsSegments } =
  require("../../pb_hooks/lib/sms-encoding.cjs") as typeof import("../../pb_hooks/lib/sms-encoding.cjs");
const {
  formatFrenchDay,
  formatFrenchTime,
  formatFrenchDeadline,
  messageVariables,
  renderTemplate,
  renderSms,
  DEFAULT_TEMPLATE_BODY,
} =
  require("../../pb_hooks/lib/message-template.cjs") as typeof import("../../pb_hooks/lib/message-template.cjs");

describe("formatFrenchDay", () => {
  it.each([
    ["2026-11-14", "samedi 14 novembre"],
    ["2026-11-01", "dimanche 1er novembre"],
    ["2027-01-04", "lundi 4 janvier"],
    ["2027-02-09", "mardi 9 février"],
    ["2027-03-10", "mercredi 10 mars"],
    ["2027-04-01", "jeudi 1er avril"],
    ["2027-05-21", "vendredi 21 mai"],
    ["2027-06-30", "mercredi 30 juin"],
    ["2027-07-14", "mercredi 14 juillet"],
    ["2027-08-15", "dimanche 15 août"],
    ["2027-09-11", "samedi 11 septembre"],
    ["2027-10-02", "samedi 2 octobre"],
    ["2027-12-25", "samedi 25 décembre"],
  ])("formats %s as %j", (day, expected) => {
    expect(formatFrenchDay(day)).toBe(expected);
  });
});

describe("formatFrenchTime", () => {
  it.each([
    ["08:00", "8h00"],
    ["07:45", "7h45"],
    ["14:30", "14h30"],
    ["00:05", "0h05"],
  ])("formats %s as %j", (time, expected) => {
    expect(formatFrenchTime(time)).toBe(expected);
  });
});

describe("formatFrenchDeadline", () => {
  it.each([
    // Winter time (UTC+1).
    ["2026-11-12T17:00:00.000Z", "jeudi 12 novembre à 18h00"],
    // Summer time (UTC+2), next day in Paris.
    ["2027-07-13T22:30:00.000Z", "mercredi 14 juillet à 0h30"],
  ])("formats %s in Paris time as %j", (utc, expected) => {
    expect(formatFrenchDeadline(new Date(utc))).toBe(expected);
  });
});

describe("messageVariables", () => {
  it("formats a hunt and its answer link", () => {
    expect(
      messageVariables(
        {
          date: "2026-11-14",
          meeting_time: "08:00",
          response_deadline: "2026-11-12 17:00:00.000Z",
        },
        "https://diane.example.org/r/abc",
      ),
    ).toStrictEqual({
      date: "samedi 14 novembre",
      heure: "8h00",
      limite: "jeudi 12 novembre à 18h00",
      jour: "14",
      lien: "https://diane.example.org/r/abc",
      plusieurs: false,
    });
  });

  it("tells when the member has several open invitations", () => {
    const hunt = {
      date: "2026-11-14",
      meeting_time: "08:00",
      response_deadline: "",
    };

    expect(messageVariables(hunt, "", { several: true }).plusieurs).toBe(true);
    expect(messageVariables(hunt, "", { several: false }).plusieurs).toBe(
      false,
    );
  });

  it("leaves the deadline and the link empty when unknown", () => {
    expect(
      messageVariables({
        date: "2026-11-01",
        meeting_time: "07:30",
        response_deadline: "",
      }),
    ).toStrictEqual({
      date: "dimanche 1er novembre",
      heure: "7h30",
      limite: "",
      jour: "1",
      lien: "",
      plusieurs: false,
    });
  });
});

describe("renderTemplate", () => {
  const variables = {
    date: "samedi 14 novembre",
    heure: "8h00",
    limite: "jeudi 12 novembre à 18h00",
    jour: "14",
    lien: "https://diane.example.org/r/abc",
  };

  it("replaces every variable, each time it appears", () => {
    expect(
      renderTemplate(
        "Battue le {date} à {heure}. Avant le {limite}. OUI {jour}. {lien} ({date})",
        variables,
      ),
    ).toBe(
      "Battue le samedi 14 novembre à 8h00. Avant le jeudi 12 novembre à 18h00. OUI 14. https://diane.example.org/r/abc (samedi 14 novembre)",
    );
  });

  it("leaves unknown placeholders untouched", () => {
    expect(renderTemplate("{nom} {Date} { date } {date}", variables)).toBe(
      "{nom} {Date} { date } samedi 14 novembre",
    );
  });

  it("does not substitute inside substituted values", () => {
    expect(renderTemplate("{lien}", { ...variables, lien: "{date}" })).toBe(
      "{date}",
    );
  });
});

describe("renderTemplate sections", () => {
  it("keeps a section whose flag is set, without its markers", () => {
    expect(
      renderTemplate("A {#plusieurs}OUI {jour}{/plusieurs}.", {
        jour: "14",
        plusieurs: true,
      }),
    ).toBe("A OUI 14.");
  });

  it("removes a section whose flag is unset or unknown", () => {
    expect(
      renderTemplate("A{#plusieurs} OUI {jour}{/plusieurs}.", {
        jour: "14",
        plusieurs: false,
      }),
    ).toBe("A.");
    expect(renderTemplate("A{#inconnu} B{/inconnu}.", {})).toBe("A.");
  });

  it("removes the whole line of a removed section", () => {
    const body = "Ligne 1\n{#plusieurs}OUI {jour}{/plusieurs}\nLigne 3";

    expect(renderTemplate(body, { jour: "14", plusieurs: false })).toBe(
      "Ligne 1\nLigne 3",
    );
    expect(renderTemplate(body, { jour: "14", plusieurs: true })).toBe(
      "Ligne 1\nOUI 14\nLigne 3",
    );
  });

  it("removes a removed section spanning whole lines, first or last", () => {
    expect(
      renderTemplate("{#plusieurs}A\nB{/plusieurs}\nC", { plusieurs: false }),
    ).toBe("C");
    expect(
      renderTemplate("C\n{#plusieurs}A\nB{/plusieurs}", { plusieurs: false }),
    ).toBe("C");
  });

  it("leaves an unclosed or mismatched section untouched", () => {
    expect(renderTemplate("A {#plusieurs}B", { plusieurs: false })).toBe(
      "A {#plusieurs}B",
    );
    expect(
      renderTemplate("A {#plusieurs}B{/autre}", { plusieurs: false }),
    ).toBe("A {#plusieurs}B{/autre}");
  });

  it("does not print a flag as a value", () => {
    expect(renderTemplate("{plusieurs}", { plusieurs: true })).toBe(
      "{plusieurs}",
    );
  });
});

describe("default template", () => {
  const LINK = `https://diane.example.org/r/${"A".repeat(43)}`;
  const hunt = (day: string) => ({
    date: day,
    meeting_time: "14:30",
    // Longest deadline label: "mercredi 30 septembre à 18h00" style.
    response_deadline: "2027-01-01 17:00:00.000Z",
  });

  it("shows the day line only with several open invitations", () => {
    const one = renderSms(
      DEFAULT_TEMPLATE_BODY,
      messageVariables(hunt("2026-11-14"), LINK, { several: false }),
    );
    const several = renderSms(
      DEFAULT_TEMPLATE_BODY,
      messageVariables(hunt("2026-11-14"), LINK, { several: true }),
    );

    expect(one).not.toContain("OUI 14");
    expect(several).toContain("OUI 14");
    expect(one).not.toMatch(/\n\n/);
    expect(several.split("\n")).toHaveLength(one.split("\n").length + 1);
  });

  // The longest day of each month ("mercredi 30 septembre"...), with the
  // longest deadline of the same month.
  const LONGEST_DAYS = Array.from({ length: 12 }, (_, month) => {
    const days: string[] = [];
    for (let date = 1; date <= 31; date++) {
      const day = new Date(Date.UTC(2027, month, date));
      if (day.getUTCMonth() === month) days.push(day.toISOString());
    }
    return days;
  });

  it.each(LONGEST_DAYS.map((days, month) => [month + 1, days]))(
    "renders as GSM-7 in at most 2 SMS segments (month %i)",
    (_, days) => {
      for (const iso of days as string[]) {
        const text = renderSms(
          DEFAULT_TEMPLATE_BODY,
          messageVariables(
            {
              date: iso.slice(0, 10),
              meeting_time: "14:30",
              response_deadline: iso.replace(
                "T00:00:00.000Z",
                " 17:30:00.000Z",
              ),
            },
            LINK,
            { several: true },
          ),
        );
        const size = smsSegments(text);

        expect(size.encoding, text).toBe("GSM-7");
        expect(size.segments, text).toBeLessThanOrEqual(2);
      }
    },
  );

  it("writes août without circumflex in SMS only", () => {
    const variables = messageVariables(hunt("2027-08-15"), LINK);

    expect(renderSms("{date}", variables)).toBe("dimanche 15 aout");
    expect(renderTemplate("{date}", variables)).toBe("dimanche 15 août");
  });
});
