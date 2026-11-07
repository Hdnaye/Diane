import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { isValidDay, parisToUtc, utcToParis, parseUtcDateTime } =
  require("../../pb_hooks/lib/paris-time.cjs") as typeof import("../../pb_hooks/lib/paris-time.cjs");

describe("isValidDay", () => {
  it.each(["2026-11-14", "2028-02-29", "2026-12-31", "2026-01-01"])(
    "accepts %j",
    (day) => {
      expect(isValidDay(day)).toBe(true);
    },
  );

  it.each([
    "2026-02-29",
    "2026-11-31",
    "2026-13-01",
    "2026-00-10",
    "2026-11-00",
    "2026-1-14",
    "14/11/2026",
    "2026-11-14 08:00",
    "",
  ])("rejects %j", (day) => {
    expect(isValidDay(day)).toBe(false);
  });
});

describe("parisToUtc", () => {
  it.each([
    // Winter time (UTC+1).
    ["2026-11-14", "08:00", "2026-11-14T07:00:00.000Z"],
    ["2027-01-02", "00:30", "2027-01-01T23:30:00.000Z"],
    // Summer time (UTC+2).
    ["2026-07-14", "08:00", "2026-07-14T06:00:00.000Z"],
    // Last Sunday of March: summer time from 02:00 (01:00 UTC).
    ["2026-03-29", "01:59", "2026-03-29T00:59:00.000Z"],
    ["2026-03-29", "03:00", "2026-03-29T01:00:00.000Z"],
    // Last Sunday of October: winter time from 03:00 (01:00 UTC).
    ["2026-10-25", "01:00", "2026-10-24T23:00:00.000Z"],
    ["2026-10-25", "08:00", "2026-10-25T07:00:00.000Z"],
    ["2027-10-31", "08:00", "2027-10-31T07:00:00.000Z"],
    ["2027-10-30", "08:00", "2027-10-30T06:00:00.000Z"],
  ])("%s %s in Paris is %s", (day, time, utc) => {
    expect(parisToUtc(day, time).toISOString()).toBe(utc);
  });
});

describe("utcToParis", () => {
  it.each([
    ["2026-11-12T17:00:00.000Z", "2026-11-12", "18:00", 4],
    ["2026-07-14T22:30:00.000Z", "2026-07-15", "00:30", 3],
    ["2026-03-29T00:59:00.000Z", "2026-03-29", "01:59", 0],
    ["2026-03-29T01:00:00.000Z", "2026-03-29", "03:00", 0],
    ["2026-10-25T00:59:00.000Z", "2026-10-25", "02:59", 0],
    ["2026-10-25T01:00:00.000Z", "2026-10-25", "02:00", 0],
  ])("%s is %s %s in Paris (weekday %i)", (utc, day, time, weekday) => {
    expect(utcToParis(new Date(utc))).toStrictEqual({ day, time, weekday });
  });
});

describe("parseUtcDateTime", () => {
  it.each([
    ["2026-11-12 17:00:00.000Z", "2026-11-12T17:00:00.000Z"],
    ["2026-11-12 17:00:00Z", "2026-11-12T17:00:00.000Z"],
    ["2026-11-12T17:00:00.123Z", "2026-11-12T17:00:00.123Z"],
  ])("parses PocketBase datetime %j", (input, iso) => {
    expect(parseUtcDateTime(input)?.toISOString()).toBe(iso);
  });

  it.each(["", "2026-11-12", "not a date", "2026-11-12 17:00:00+01:00"])(
    "returns null for %j",
    (input) => {
      expect(parseUtcDateTime(input)).toBeNull();
    },
  );
});
