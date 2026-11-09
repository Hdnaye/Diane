import type PocketBase from 'pocketbase';
import { ClientResponseError } from 'pocketbase';

import { HuntDayTakenError, type HuntRepository } from '@/data/hunt-repository';
import type { OrganizerSession } from '@/data/pocketbase-session';
import type { Hunt, NewHunt } from '@/data/types';
import {
  Collections,
  HuntsStatusOptions,
  type Create,
  type HuntsResponse,
} from '@/lib/pocketbase-types';

/** Hunts stored in PocketBase (collection `hunts`), as the authenticated organizer. */
export function createPocketBaseHuntRepository(
  pb: PocketBase,
  session: OrganizerSession
): HuntRepository {
  const hunts = () => pb.collection(Collections.Hunts);
  return {
    async list() {
      const records = await session.run(
        () => hunts().getFullList<HuntsResponse>({ sort: 'date' }),
        // A revoked token sees an empty list (PocketBase treats it as a guest).
        { isDoubtful: (outcome) => 'result' in outcome && outcome.result.length === 0 }
      );
      return records.map(toHunt);
    },
    async create(hunt) {
      try {
        const record = await session.run(
          () => hunts().create<HuntsResponse>(toCreateRecord(hunt)),
          { isDoubtful: (outcome) => 'error' in outcome && isRefusedWithoutReason(outcome.error) }
        );
        return toHunt(record);
      } catch (error) {
        if (isDayTaken(error)) {
          throw new HuntDayTakenError(hunt.date);
        }
        throw error;
      }
    },
  };
}

export function toHunt(record: HuntsResponse): Hunt {
  return {
    id: record.id,
    date: record.date,
    meeting_time: record.meeting_time,
    // 0 (empty) in PocketBase: no limit.
    max_participants: record.max_participants || null,
    response_deadline: toIsoInstant(record.response_deadline),
    status: record.status,
  };
}

function toCreateRecord(hunt: NewHunt): Create<'hunts'> {
  return {
    date: hunt.date,
    meeting_time: hunt.meeting_time,
    max_participants: hunt.max_participants ?? 0,
    response_deadline: toPocketBaseDateTime(hunt.response_deadline),
    status: HuntsStatusOptions.draft,
  };
}

/** "2026-11-09 19:00:00.000Z" (PocketBase) → "2026-11-09T19:00:00.000Z"; empty stays empty. */
export function toIsoInstant(dateTime: string): string {
  return dateTime ? new Date(dateTime.replace(' ', 'T')).toISOString() : '';
}

/** ISO instant → PocketBase's datetime format, "2026-11-09 19:00:00.000Z". */
export function toPocketBaseDateTime(instant: string): string {
  return new Date(instant).toISOString().replace('T', ' ');
}

/**
 * A creation refused without any field error (400) or forbidden (403): what a revoked token,
 * treated as a guest by PocketBase, gets. A refusal naming a field is about the data.
 */
function isRefusedWithoutReason(error: unknown): boolean {
  return (
    error instanceof ClientResponseError &&
    (error.status === 403 ||
      (error.status === 400 && Object.keys(error.response?.data ?? {}).length === 0))
  );
}

/** The unique index on `date` refused the hunt: there is already one that day. */
function isDayTaken(error: unknown): boolean {
  return (
    error instanceof ClientResponseError &&
    error.status === 400 &&
    error.response?.data?.date?.code === 'validation_not_unique'
  );
}
