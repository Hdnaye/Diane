import { addDays, addHours, roundToNearestHours, set, startOfMinute } from 'date-fns';
import { z } from 'zod';

import type { NewHunt } from '@/data/types';
import { formatLongDay, fromDateKey, toDateKey } from '@/lib/dates';

/** What the creation form edits (the max participants field is free text). */
export type HuntFormValues = {
  date: string;
  meetingTime: string;
  maxParticipants: string;
  responseDeadline: Date;
};

export const DEFAULT_MEETING_TIME = '08:00';
/** Members have 48 hours to answer by default. */
export const DEFAULT_ANSWER_DELAY_HOURS = 48;
/** When 48 hours is too late, the default deadline is the eve of the hunt at this hour. */
export const EVE_DEADLINE_HOUR = 20;

/**
 * Default answer deadline: 48 hours from now, rounded up to the next hour ("11 h 00" reads
 * better than "10 h 09"). If that is not before the hunt, the eve of the hunt at 20 h 00
 * (left as is even if already passed: the form then shows the error).
 */
export function defaultResponseDeadline(now: Date, date = '', meetingTime = DEFAULT_MEETING_TIME) {
  // Seconds are ignored: only a time like "10 h 09" is rounded up.
  const rounded = roundToNearestHours(startOfMinute(addHours(now, DEFAULT_ANSWER_DELAY_HOURS)), {
    roundingMethod: 'ceil',
  });
  if (!date || rounded < huntStart(date, meetingTime)) {
    return rounded;
  }
  return set(addDays(fromDateKey(date), -1), {
    hours: EVE_DEADLINE_HOUR,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  });
}

export function defaultHuntFormValues(now: Date, date = ''): HuntFormValues {
  return {
    date,
    meetingTime: DEFAULT_MEETING_TIME,
    maxParticipants: '',
    responseDeadline: defaultResponseDeadline(now, date),
  };
}

/** Start of a hunt: its day at the meeting time, local time. */
export function huntStart(date: string, meetingTime: string): Date {
  const [hours, minutes] = meetingTime.split(':').map(Number);
  return set(fromDateKey(date), { hours, minutes, seconds: 0, milliseconds: 0 });
}

export const messages = {
  dateRequired: 'Choisissez le jour de la battue.',
  dateInPast: 'La date de la battue ne peut pas être dans le passé.',
  dateTaken: (date: string) =>
    `Il y a déjà une battue le ${formatLongDay(date)}. Choisissez un autre jour.`,
  maxParticipants: 'Indiquez un nombre entier, au moins 1, ou laissez vide.',
  deadlinePassed: 'La date limite de réponse est déjà passée.',
  deadlineAfterHunt: 'La date limite de réponse doit être avant la battue.',
};

/**
 * Validation of the creation form; outputs the hunt to create.
 * `takenDates`: days that already have a hunt (at most one hunt per day).
 */
export function createHuntFormSchema({ takenDates, now }: { takenDates: string[]; now: Date }) {
  const today = toDateKey(now);
  // Every rule is checked in one pass, so the organizer sees all the errors at once.
  return z
    .object({
      date: z.string(),
      meetingTime: z.string().regex(/^\d{2}:\d{2}$/),
      maxParticipants: z.string().trim(),
      responseDeadline: z.date(),
    })
    .superRefine((values, ctx) => {
      const issue = (path: keyof HuntFormValues, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message });

      if (!values.date) {
        issue('date', messages.dateRequired);
      } else if (values.date < today) {
        issue('date', messages.dateInPast);
      } else if (takenDates.includes(values.date)) {
        issue('date', messages.dateTaken(values.date));
      }
      if (values.maxParticipants !== '' && !isWholeNumberFromOne(values.maxParticipants)) {
        issue('maxParticipants', messages.maxParticipants);
      }
      if (values.responseDeadline <= now) {
        issue('responseDeadline', messages.deadlinePassed);
      } else if (
        values.date &&
        values.responseDeadline >= huntStart(values.date, values.meetingTime)
      ) {
        issue('responseDeadline', messages.deadlineAfterHunt);
      }
    })
    .transform((values): NewHunt => ({
      date: values.date,
      meetingTime: values.meetingTime,
      maxParticipants: values.maxParticipants === '' ? null : Number(values.maxParticipants),
      responseDeadline: values.responseDeadline.toISOString(),
    }));
}

function isWholeNumberFromOne(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) >= 1;
}
