import type { Hunt, NewHunt } from '@/data/types';

/**
 * Access to the hunts. Screens only use this interface (through TanStack Query, see
 * `hunt-queries.ts`): plugging PocketBase in only means writing another implementation.
 */
export interface HuntRepository {
  /** All hunts, sorted by day. */
  list(): Promise<Hunt[]>;
  /** Creates a hunt; rejects with `HuntDayTakenError` if the day already has one. */
  create(hunt: NewHunt): Promise<Hunt>;
}

export class HuntDayTakenError extends Error {
  constructor(readonly date: string) {
    super(`A hunt already exists on ${date}`);
    this.name = 'HuntDayTakenError';
  }
}

/** In-memory implementation, used until the PocketBase collections exist. */
export function createInMemoryHuntRepository(_initial: Hunt[] = []): HuntRepository {
  return {
    list: async () => [],
    create: async (hunt) => ({ ...hunt, id: '' }),
  };
}
