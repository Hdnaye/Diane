// Domain types used by the screens, derived from the types generated from the PocketBase schema
// (src/lib/pocketbase-types.ts): no collection type is declared by hand.
import type { HuntsResponse } from '@/lib/pocketbase-types';

/**
 * A hunt: `date` is its Paris day (`yyyy-MM-dd`, at most one hunt per day), `meeting_time` its
 * Paris meeting time (`HH:mm`), `response_deadline` an ISO 8601 instant before the hunt.
 * `max_participants` is `null` when there is no limit (stored as 0 in PocketBase).
 */
export type Hunt = Pick<HuntsResponse, 'id' | 'date' | 'meeting_time' | 'response_deadline'> & {
  max_participants: NonNullable<HuntsResponse['max_participants']> | null;
};

export type NewHunt = Omit<Hunt, 'id'>;
