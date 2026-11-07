// Conversions between UTC and the wall time of the association (Europe/Paris).
// PocketBase stores datetimes in UTC; hunt days and meeting times are Paris
// wall times. Intl time zones are not available in PocketBase's JSVM: the EU
// daylight saving rule is applied directly (summer time from the last Sunday
// of March to the last Sunday of October, switching at 01:00 UTC).
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/paris-time.cjs`)
// and by Vitest with createRequire.

const HOUR_MS = 60 * 60 * 1000;

/**
 * @param {number} year
 * @param {number} month 0-based.
 * @returns {number} UTC timestamp of the last Sunday of the month, 01:00.
 */
function lastSundayAt1Utc(year, month) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 1));
  return lastDay.getTime() - lastDay.getUTCDay() * 24 * HOUR_MS;
}

/**
 * Offset of Paris time from UTC at a given instant, in milliseconds.
 *
 * @param {number} timestamp UTC timestamp.
 */
function parisOffset(timestamp) {
  const year = new Date(timestamp).getUTCFullYear();
  const summer =
    timestamp >= lastSundayAt1Utc(year, 2) &&
    timestamp < lastSundayAt1Utc(year, 9);
  return (summer ? 2 : 1) * HOUR_MS;
}

/**
 * Tells if `day` is a real calendar day written YYYY-MM-DD.
 *
 * @param {string} day
 */
function isValidDay(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, date));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === date
  );
}

/**
 * Instant of a Paris wall time.
 *
 * @param {string} day  YYYY-MM-DD.
 * @param {string} time HH:MM.
 * @returns {Date}
 */
function parisToUtc(day, time) {
  const [year, month, date] = day.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const wall = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(date),
    Number(hours),
    Number(minutes),
  );
  // The offset at (wall - 1 h) is the one in force at the wall time, except
  // within the hour skipped or repeated by a switch.
  return new Date(wall - parisOffset(wall - HOUR_MS));
}

/**
 * Paris wall time of an instant.
 *
 * @param {Date} instant
 * @returns {{ day: string, time: string, weekday: number }} weekday: 0 = Sunday.
 */
function utcToParis(instant) {
  const wall = new Date(instant.getTime() + parisOffset(instant.getTime()));
  const iso = wall.toISOString();
  return {
    day: iso.slice(0, 10),
    time: iso.slice(11, 16),
    weekday: wall.getUTCDay(),
  };
}

/**
 * Parses a UTC datetime as PocketBase serializes it
 * ("2026-11-12 17:00:00.000Z"), or null.
 *
 * @param {string} value
 * @returns {Date | null}
 */
function parseUtcDateTime(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(
      value,
    );
  if (!match) return null;
  const [year, month, date, hours, minutes, seconds] = match
    .slice(1, 7)
    .map(Number);
  const ms = Number((match[7] ?? "0").padEnd(3, "0"));
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(date),
      Number(hours),
      Number(minutes),
      Number(seconds),
      ms,
    ),
  );
}

module.exports = { isValidDay, parisToUtc, utcToParis, parseUtcDateTime };
