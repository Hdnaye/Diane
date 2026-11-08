// Paris wall time (Europe/Paris), whatever the phone's time zone: hunt days, meeting times and
// answer deadlines are those of the association. Same rule as the back-end
// (backend/pb_hooks/lib/paris-time.cjs): the EU daylight saving rule is applied directly
// (summer time from the last Sunday of March to the last Sunday of October, switching at
// 01:00 UTC), without relying on the time zone data of the JS engine.
import { formatLongDay, formatTime } from '@/lib/dates';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** UTC timestamp of the last Sunday of a month (0-based), 01:00. */
function lastSundayAt1Utc(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 1));
  return lastDay.getTime() - lastDay.getUTCDay() * DAY_MS;
}

/** Offset of Paris time from UTC at an instant, in milliseconds. */
function parisOffset(timestamp: number): number {
  const year = new Date(timestamp).getUTCFullYear();
  const summer = timestamp >= lastSundayAt1Utc(year, 2) && timestamp < lastSundayAt1Utc(year, 9);
  return (summer ? 2 : 1) * HOUR_MS;
}

/** Instant of a Paris wall time: day `yyyy-MM-dd`, time `HH:mm`. */
export function parisToUtc(day: string, time: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, date, hours, minutes);
  // The offset at (wall - 1 h) is the one in force at the wall time, except within the hour
  // skipped or repeated by a switch.
  return new Date(wall - parisOffset(wall - HOUR_MS));
}

/** Paris day (`yyyy-MM-dd`) and time (`HH:mm`) of an instant. */
export function utcToParis(instant: Date): { day: string; time: string } {
  const iso = new Date(instant.getTime() + parisOffset(instant.getTime())).toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Paris day of an instant, `yyyy-MM-dd` (e.g. today: `parisDay(new Date())`). */
export function parisDay(instant: Date): string {
  return utcToParis(instant).day;
}

/** Adds whole days to a day key `yyyy-MM-dd`. */
export function addDaysToKey(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/** Moves an instant by whole Paris days, keeping its Paris time (even across a switch). */
export function shiftParisDays(instant: Date, days: number): Date {
  const { day, time } = utcToParis(instant);
  return parisToUtc(addDaysToKey(day, days), time);
}

/** "lundi 9 novembre à 20 h 00", in Paris time. */
export function formatParisDateTime(instant: Date): string {
  const { day, time } = utcToParis(instant);
  return `${formatLongDay(day)} à ${formatTime(time)}`;
}
