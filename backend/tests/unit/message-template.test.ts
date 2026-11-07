import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  formatFrenchDay,
  formatFrenchTime,
  formatFrenchDeadline,
  messageVariables,
  renderTemplate,
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
    });
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
