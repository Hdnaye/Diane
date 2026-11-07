import { createInMemoryHuntRepository, HuntDayTakenError } from '@/data/hunt-repository';
import type { NewHunt } from '@/data/types';

const hunt = (date: string): NewHunt => ({
  date,
  meetingTime: '08:00',
  maxParticipants: null,
  responseDeadline: '2026-11-09T19:00:00.000Z',
});

describe('in-memory hunt repository', () => {
  it('lists the hunts sorted by day', async () => {
    const repository = createInMemoryHuntRepository([
      { ...hunt('2026-11-21'), id: 'b' },
      { ...hunt('2026-11-14'), id: 'a' },
    ]);

    const hunts = await repository.list();

    expect(hunts.map((h) => h.date)).toEqual(['2026-11-14', '2026-11-21']);
  });

  it('creates a hunt with an id and lists it afterwards', async () => {
    const repository = createInMemoryHuntRepository();

    const created = await repository.create({ ...hunt('2026-11-14'), maxParticipants: 12 });

    expect(created.id).not.toBe('');
    expect(await repository.list()).toEqual([created]);
  });

  it('refuses a second hunt on the same day', async () => {
    const repository = createInMemoryHuntRepository();
    await repository.create(hunt('2026-11-14'));

    await expect(repository.create(hunt('2026-11-14'))).rejects.toBeInstanceOf(HuntDayTakenError);
    expect(await repository.list()).toHaveLength(1);
  });
});
