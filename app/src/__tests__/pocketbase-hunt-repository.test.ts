import { HuntDayTakenError } from '@/data/hunt-repository';
import { createPocketBaseHuntRepository } from '@/data/pocketbase-hunt-repository';
import { createOrganizerSession, createPocketBaseClient } from '@/data/pocketbase-session';
import type { NewHunt } from '@/data/types';
import type { HuntsResponse } from '@/lib/pocketbase-types';
import {
  AUTH_PATH,
  authSuccess,
  FAKE_API_URL,
  fakePocketBase,
  fakeToken,
  REFRESH_PATH,
  unauthorized,
  type FakeHandler,
  type FakeRequest,
  type FakeResponse,
} from '@/test-utils/fake-pocketbase';

const HUNTS_PATH = '/api/collections/hunts/records';

/** A hunt record as PocketBase returns it (fictitious data). */
function huntRecord(overrides: Partial<HuntsResponse> & Pick<HuntsResponse, 'id' | 'date'>) {
  return {
    collectionId: 'pbc_hunts',
    collectionName: 'hunts',
    meeting_time: '08:00',
    max_participants: 0,
    response_deadline: '2026-11-09 19:00:00.000Z',
    status: 'draft',
    invitations_sent_at: '',
    reminder_sent_at: '',
    created: '2026-11-07 09:00:00.000Z',
    updated: '2026-11-07 09:00:00.000Z',
    ...overrides,
  };
}

const page = (items: unknown[]) => ({
  page: 1,
  perPage: 1000,
  totalItems: -1,
  totalPages: -1,
  items,
});

const token = fakeToken();

function setUp(handler: FakeHandler) {
  const server = fakePocketBase((request) =>
    request.path === AUTH_PATH ? authSuccess(token) : handler(request)
  );
  const pb = createPocketBaseClient(FAKE_API_URL);
  const session = createOrganizerSession(pb, {
    organizerEmail: 'organizer@example.com',
    organizerKey: 'fake-key-for-tests',
  });
  return { ...server, repository: createPocketBaseHuntRepository(pb, session) };
}

const newHunt: NewHunt = {
  date: '2026-11-20',
  meeting_time: '07:15',
  max_participants: 15,
  response_deadline: '2026-11-09T19:00:00.000Z',
};

describe('PocketBase hunt repository', () => {
  it('lists the hunts sorted by day, once authenticated', async () => {
    const { requests, repository } = setUp(() => ({
      status: 200,
      body: page([
        huntRecord({ id: 'hunt1', date: '2026-11-14', max_participants: 12 }),
        huntRecord({ id: 'hunt2', date: '2026-11-21', meeting_time: '07:30' }),
      ]),
    }));

    const hunts = await repository.list();

    expect(hunts).toEqual([
      {
        id: 'hunt1',
        date: '2026-11-14',
        meeting_time: '08:00',
        max_participants: 12,
        response_deadline: '2026-11-09T19:00:00.000Z',
        status: 'draft',
      },
      {
        id: 'hunt2',
        date: '2026-11-21',
        meeting_time: '07:30',
        // 0 in PocketBase: no limit.
        max_participants: null,
        response_deadline: '2026-11-09T19:00:00.000Z',
        status: 'draft',
      },
    ]);
    expect(requests[0].path).toBe(AUTH_PATH);
    expect(requests[1]).toMatchObject({ method: 'GET', headers: { Authorization: token } });
    expect(requests[1].path).toMatch(new RegExp(`^${HUNTS_PATH}\\?.*sort=date`));
  });

  it('creates a draft hunt and returns it', async () => {
    const { requests, repository } = setUp((request) => ({
      status: 200,
      body: huntRecord({
        id: 'hunt3',
        ...(request.body as Pick<HuntsResponse, 'date'>),
        response_deadline: '2026-11-09 19:00:00.000Z',
      }),
    }));

    const created = await repository.create(newHunt);

    expect(requests[1]).toMatchObject({
      method: 'POST',
      path: HUNTS_PATH,
      headers: { Authorization: token },
      body: {
        date: '2026-11-20',
        meeting_time: '07:15',
        max_participants: 15,
        response_deadline: '2026-11-09 19:00:00.000Z',
        status: 'draft',
      },
    });
    expect(created).toEqual({ ...newHunt, id: 'hunt3' });
  });

  it('stores "no limit" as 0', async () => {
    const { requests, repository } = setUp((request) => ({
      status: 200,
      body: huntRecord({ id: 'hunt4', ...(request.body as Pick<HuntsResponse, 'date'>) }),
    }));

    const created = await repository.create({ ...newHunt, max_participants: null });

    expect(requests[1].body).toMatchObject({ max_participants: 0 });
    expect(created.max_participants).toBeNull();
  });

  it('refuses a second hunt on the same day', async () => {
    const { repository } = setUp(() => ({
      status: 400,
      body: {
        status: 400,
        message: 'Failed to create record.',
        data: { date: { code: 'validation_not_unique', message: 'Value must be unique.' } },
      },
    }));

    const creation = repository.create(newHunt);

    await expect(creation).rejects.toBeInstanceOf(HuntDayTakenError);
    await expect(creation).rejects.toMatchObject({ date: '2026-11-20' });
  });

  it('passes on the other errors', async () => {
    const { repository } = setUp(() => ({
      status: 400,
      body: {
        status: 400,
        message: 'Invalid hunt.',
        data: { response_deadline: { code: 'deadline_after_hunt', message: 'Must be before.' } },
      },
    }));

    const creation = repository.create(newHunt);

    await expect(creation).rejects.not.toBeInstanceOf(HuntDayTakenError);
    await expect(creation).rejects.toMatchObject({ status: 400 });
  });

  describe('with a token revoked on the server', () => {
    // PocketBase treats a revoked token as a guest: an empty list, a creation refused with a 400.
    function revokedServer(handler: (request: FakeRequest, guest: boolean) => FakeResponse) {
      let revoked = false;
      const server = fakePocketBase((request) => {
        if (request.path === AUTH_PATH) {
          revoked = false;
          return authSuccess(token);
        }
        if (request.path === REFRESH_PATH) {
          return revoked ? unauthorized : authSuccess(token);
        }
        return handler(request, revoked);
      });
      const pb = createPocketBaseClient(FAKE_API_URL);
      const session = createOrganizerSession(pb, {
        organizerEmail: 'organizer@example.com',
        organizerKey: 'fake-key-for-tests',
      });
      const repository = createPocketBaseHuntRepository(pb, session);
      return { ...server, repository, revoke: () => (revoked = true) };
    }
    const paths = (requests: FakeRequest[]) =>
      requests.map((request) => request.path.replace(/\?.*/, ''));

    it('authenticates again and lists the hunts instead of an empty list', async () => {
      const { requests, repository, revoke } = revokedServer((_request, guest) => ({
        status: 200,
        body: page(guest ? [] : [huntRecord({ id: 'hunt1', date: '2026-11-14' })]),
      }));
      await repository.list();
      revoke();
      requests.length = 0;

      const hunts = await repository.list();

      expect(hunts.map((hunt) => hunt.date)).toEqual(['2026-11-14']);
      expect(paths(requests)).toEqual([HUNTS_PATH, REFRESH_PATH, AUTH_PATH, HUNTS_PATH]);
    });

    it('authenticates again and creates the hunt instead of failing', async () => {
      const { requests, repository, revoke } = revokedServer((request, guest) =>
        guest
          ? { status: 400, body: { status: 400, message: 'Failed to create record.', data: {} } }
          : {
              status: 200,
              body: huntRecord({
                id: 'hunt5',
                ...(request.body as Pick<HuntsResponse, 'date'>),
              }),
            }
      );
      await repository.list();
      revoke();
      requests.length = 0;

      const created = await repository.create(newHunt);

      expect(created).toMatchObject({ id: 'hunt5', date: '2026-11-20' });
      expect(paths(requests)).toEqual([HUNTS_PATH, REFRESH_PATH, AUTH_PATH, HUNTS_PATH]);
    });

    it('does not check the token when the day is taken', async () => {
      const { requests, repository } = revokedServer(() => ({
        status: 400,
        body: {
          status: 400,
          message: 'Failed to create record.',
          data: { date: { code: 'validation_not_unique', message: 'Value must be unique.' } },
        },
      }));

      await expect(repository.create(newHunt)).rejects.toBeInstanceOf(HuntDayTakenError);
      expect(paths(requests)).toEqual([AUTH_PATH, HUNTS_PATH]);
    });
  });
});
