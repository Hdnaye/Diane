import { addHours, set } from 'date-fns';
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

export function defaultHuntFormValues(now: Date, date = ''): HuntFormValues {
  return {
    date,
    meetingTime: DEFAULT_MEETING_TIME,
    maxParticipants: '',
    responseDeadline: set(addHours(now, DEFAULT_ANSWER_DELAY_HOURS), {
      seconds: 0,
      milliseconds: 0,
    }),
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
  return z
    .object({
      date: z.string(),
      meetingTime: z.string().regex(/^\d{2}:\d{2}$/),
      maxParticipants: z
        .string()
        .trim()
        .refine((value) => value === '' || (/^\d+$/.test(value) && Number(value) >= 1), {
          error: messages.maxParticipants,
        })
        .transform((value) => (value === '' ? null : Number(value))),
      responseDeadline: z.date(),
    })
    .superRefine((values, ctx) => {
      if (!values.date) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: messages.dateRequired });
        return;
      }
      if (values.date < today) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: messages.dateInPast });
      } else if (takenDates.includes(values.date)) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: messages.dateTaken(values.date) });
      }
      if (values.responseDeadline <= now) {
        ctx.addIssue({
          code: 'custom',
          path: ['responseDeadline'],
          message: messages.deadlinePassed,
        });
      } else if (values.responseDeadline >= huntStart(values.date, values.meetingTime)) {
        ctx.addIssue({
          code: 'custom',
          path: ['responseDeadline'],
          message: messages.deadlineAfterHunt,
        });
      }
    })
    .transform((values): NewHunt => ({
      date: values.date,
      meetingTime: values.meetingTime,
      maxParticipants: values.maxParticipants,
      responseDeadline: values.responseDeadline.toISOString(),
    }));
}
