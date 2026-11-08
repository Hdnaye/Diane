import { addDays, addHours, nextSaturday, set } from 'date-fns';

import { createInMemoryHuntRepository } from '@/data/hunt-repository';
import { toDateKey } from '@/lib/dates';

// TODO: replace with the PocketBase implementation once the collections exist.
// Fictitious demo hunts on the next two Saturdays, so the calendar is not empty in Expo Go.
function demoHunts() {
  const firstSaturday = nextSaturday(new Date());
  return [firstSaturday, addDays(firstSaturday, 7)].map((day, index) => ({
    id: `demo-${index + 1}`,
    date: toDateKey(day),
    meeting_time: '08:00',
    max_participants: index === 0 ? 12 : null,
    response_deadline: addHours(set(day, { hours: 8, minutes: 0 }), -48).toISOString(),
  }));
}

/** Hunt repository used by the app. */
export const appHuntRepository = createInMemoryHuntRepository(demoHunts());
