import { z } from 'zod';

import type { NewHunt } from '@/data/types';
import { formatLongDay } from '@/lib/dates';
import { addDaysToKey, parisDay, parisToUtc } from '@/lib/paris-time';

/** What the creation form edits (the max participants field is free text). */
export type HuntFormValues = {
  date: string;
  meetingTime: string;
  maxParticipants: string;
  responseDeadline: Date;
};

export const DEFAULT_MEETING_TIME = '08:00';
/** By default, members answer until two days after today (in Paris)… */
export const DEFAULT_ANSWER_DELAY_DAYS = 2;
/** …at 20 h 00, or until the eve of the hunt at 20 h 00 when that is too late. */
export const DEADLINE_TIME = '20:00';

/**
 * Default answer deadline, in Paris time whatever the phone's time zone (same rule as the
 * back-end): two days after today at 20 h 00. If that is not strictly before the hunt, the eve
 * of the hunt at 20 h 00, left as is even if already passed (the form then shows the error).
 */
export function defaultResponseDeadline(now: Date, date = '', meetingTime = DEFAULT_MEETING_TIME) {
  const inTwoDays = parisToUtc(
    addDaysToKey(parisDay(now), DEFAULT_ANSWER_DELAY_DAYS),
    DEADLINE_TIME
  );
  if (!date || inTwoDays < huntStart(date, meetingTime)) {
    return inTwoDays;
  }
  return parisToUtc(addDaysToKey(date, -1), DEADLINE_TIME);
}

export function defaultHuntFormValues(now: Date, date = ''): HuntFormValues {
  return {
    date,
    meetingTime: DEFAULT_MEETING_TIME,
    maxParticipants: '',
    responseDeadline: defaultResponseDeadline(now, date),
  };
}

/** Start of a hunt: its day at the meeting time, Paris time. */
export function huntStart(date: string, meetingTime: string): Date {
  return parisToUtc(date, meetingTime);
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
  const today = parisDay(now);
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
      meeting_time: values.meetingTime,
      max_participants: values.maxParticipants === '' ? null : Number(values.maxParticipants),
      response_deadline: values.responseDeadline.toISOString(),
    }));
}

function isWholeNumberFromOne(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) >= 1;
}
