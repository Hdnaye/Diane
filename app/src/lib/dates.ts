// Date formatting and day keys, in French (date-fns, locale `fr`).
// A day key is a local `yyyy-MM-dd` string: hunt days are calendar days, not instants.
import { addMinutes, format, parse } from 'date-fns';
import { fr } from 'date-fns/locale';

const DATE_KEY = 'yyyy-MM-dd';
const TIME = 'HH:mm';

export function toDateKey(date: Date): string {
  return format(date, DATE_KEY);
}

export function fromDateKey(dateKey: string): Date {
  return parse(dateKey, DATE_KEY, new Date());
}

/** "samedi 14 novembre" */
export function formatLongDay(dateKey: string): string {
  return format(fromDateKey(dateKey), 'EEEE d MMMM', { locale: fr });
}

/** "08:00" → "8 h 00" */
export function formatTime(time: string): string {
  return format(parse(time, TIME, new Date(2000, 0, 1)), "H 'h' mm", { locale: fr });
}

/** Shifts an `HH:mm` time by a number of minutes, wrapping around midnight. */
export function shiftTime(time: string, minutes: number): string {
  return format(addMinutes(parse(time, TIME, new Date(2000, 0, 1)), minutes), TIME);
}
