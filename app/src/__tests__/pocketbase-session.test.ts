import { ClientResponseError } from 'pocketbase';

import { createPocketBaseClient, createOrganizerSession } from '@/data/pocketbase-session';
import {
  AUTH_PATH,
  authSuccess,
  FAKE_API_URL,
  fakePocketBase,
  fakeToken,
  REFRESH_PATH,
  tooManyRequests,
  unauthorized,
} from '@/test-utils/fake-pocketbase';

const credentials = { organizerEmail: 'organizer@example.com', organizerKey: 'fake-key-for-tests' };

function setUp(options: Parameters<typeof createOrganizerSession>[2] = {}) {
  const pb = createPocketBaseClient(FAKE_API_URL);
  return { pb, session: createOrganizerSession(pb, credentials, { retryDelayMs: 0, ...options }) };
}

const authRequests = (requests: { path: string }[]) =>
  requests.filter((request) => request.path === AUTH_PATH);
const paths = (requests: { path: string }[]) => requests.map((request) => request.path);

/** A clock the tests move forward. */
function fakeClock() {
  let now = 1_000_000;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('organizer session', () => {
  it('authenticates silently with the organizer e-mail and key', async () => {
    const { requests } = fakePocketBase(() => authSuccess());
    const { pb, session } = setUp();

    await session.connect();

    expect(requests).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: AUTH_PATH,
        body: { identity: 'organizer@example.com', password: 'fake-key-for-tests' },
      }),
    ]);
    expect(pb.authStore.isValid).toBe(true);
  });

  it('authenticates only once, even when asked several times at once', async () => {
    const { requests } = fakePocketBase(() => authSuccess());
    const { session } = setUp();

    await Promise.all([session.connect(), session.connect()]);
    await session.connect();

    expect(authRequests(requests)).toHaveLength(1);
  });

  it('waits and tries again when the server limits authentications (429)', async () => {
    let attempts = 0;
    const { requests } = fakePocketBase(() => (++attempts < 3 ? tooManyRequests : authSuccess()));
    const { pb, session } = setUp();

    await session.connect();

    expect(authRequests(requests)).toHaveLength(3);
    expect(pb.authStore.isValid).toBe(true);
  });

  it('gives up after a few refused attempts', async () => {
    const { requests } = fakePocketBase(() => tooManyRequests);
    const { session } = setUp({ maxAttempts: 3 });

    await expect(session.connect()).rejects.toBeInstanceOf(ClientResponseError);
    expect(authRequests(requests)).toHaveLength(3);
  });

  it('does not insist when the key is refused, but tries again on the next call', async () => {
    let refuse = true;
    const { requests } = fakePocketBase(() =>
      refuse
        ? { status: 400, body: { status: 400, message: 'Failed to authenticate.', data: {} } }
        : authSuccess()
    );
    const { session } = setUp();

    await expect(session.connect()).rejects.toMatchObject({ status: 400 });
    expect(authRequests(requests)).toHaveLength(1);

    refuse = false;
    await session.connect();
    expect(authRequests(requests)).toHaveLength(2);
  });

  it('authenticates again when the token has expired', async () => {
    let token = fakeToken(-60, 'expired');
    const { requests } = fakePocketBase(() => authSuccess(token));
    const { session } = setUp();
    await session.connect();

    token = fakeToken(3600, 'fresh');
    await session.connect();

    expect(authRequests(requests)).toHaveLength(2);
  });

  it('runs a request with the token, authenticating first', async () => {
    const token = fakeToken();
    const { requests } = fakePocketBase((request) =>
      request.path === AUTH_PATH ? authSuccess(token) : { status: 200, body: { ok: true } }
    );
    const { pb, session } = setUp();

    const result = await session.run(() => pb.send('/api/health', {}));

    expect(result).toEqual({ ok: true });
    expect(requests.map((request) => request.path)).toEqual([AUTH_PATH, '/api/health']);
    expect(requests[1].headers.Authorization).toBe(token);
  });

  it('authenticates again and retries once when a request is refused as unauthorized (401)', async () => {
    let unauthorized = 1;
    const { requests } = fakePocketBase((request) => {
      if (request.path === AUTH_PATH) {
        return authSuccess();
      }
      return unauthorized-- > 0
        ? { status: 401, body: { status: 401, message: 'Unauthorized.', data: {} } }
        : { status: 200, body: { ok: true } };
    });
    const { pb, session } = setUp();

    await expect(session.run(() => pb.send('/api/health', {}))).resolves.toEqual({ ok: true });
    expect(requests.map((request) => request.path)).toEqual([
      AUTH_PATH,
      '/api/health',
      AUTH_PATH,
      '/api/health',
    ]);
  });

  describe('token revoked on the server (e.g. organizer account updated by `npm run setup`)', () => {
    // PocketBase treats an invalid token as a guest: lists come back empty, creations are
    // refused with a 400, never a 401. Only auth-refresh tells a revoked token apart.

    it('has the server check the token again when the last check is over a minute old', async () => {
      const clock = fakeClock();
      const { requests } = fakePocketBase(() => authSuccess());
      const { session } = setUp({ now: clock.now });
      await session.connect();

      clock.advance(30_000);
      await session.connect();
      expect(paths(requests)).toEqual([AUTH_PATH]);

      clock.advance(31_000);
      await session.connect();
      expect(paths(requests)).toEqual([AUTH_PATH, REFRESH_PATH]);
    });

    it('authenticates again when the server says the token is no longer valid', async () => {
      const clock = fakeClock();
      let revoked = false;
      const { requests, fetchMock } = fakePocketBase((request) =>
        request.path === REFRESH_PATH && revoked ? unauthorized : authSuccess()
      );
      const { pb, session } = setUp({ now: clock.now });
      await session.connect();

      revoked = true;
      clock.advance(61_000);
      await session.connect();

      expect(paths(requests)).toEqual([AUTH_PATH, REFRESH_PATH, AUTH_PATH]);
      expect(pb.authStore.isValid).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('checks the token when a result is doubtful and retries once with a new one', async () => {
      let revoked = true;
      const { requests } = fakePocketBase((request) => {
        if (request.path === REFRESH_PATH) {
          return revoked ? unauthorized : authSuccess();
        }
        if (request.path === AUTH_PATH) {
          revoked = false;
          return authSuccess();
        }
        return { status: 200, body: { items: revoked ? [] : ['hunt'] } };
      });
      const { pb, session } = setUp();
      await session.connect();
      revoked = true;

      const result = await session.run(() => pb.send<{ items: string[] }>('/api/list', {}), {
        isDoubtful: (outcome) => 'result' in outcome && outcome.result.items.length === 0,
      });

      expect(result).toEqual({ items: ['hunt'] });
      expect(paths(requests)).toEqual([
        AUTH_PATH,
        '/api/list',
        REFRESH_PATH,
        AUTH_PATH,
        '/api/list',
      ]);
    });

    it('keeps a doubtful result when the server confirms the token', async () => {
      const { requests } = fakePocketBase((request) =>
        request.path === '/api/list' ? { status: 200, body: { items: [] } } : authSuccess()
      );
      const { pb, session } = setUp();

      const result = await session.run(() => pb.send<{ items: string[] }>('/api/list', {}), {
        isDoubtful: (outcome) => 'result' in outcome && outcome.result.items.length === 0,
      });

      expect(result).toEqual({ items: [] });
      expect(paths(requests)).toEqual([AUTH_PATH, '/api/list', REFRESH_PATH]);
    });

    it('checks the token on a doubtful error, retries once, and passes on a confirmed error', async () => {
      const refused = { status: 400, body: { status: 400, message: 'Failed.', data: {} } };
      const { requests } = fakePocketBase((request) =>
        request.path === '/api/create' ? refused : authSuccess()
      );
      const { pb, session } = setUp();

      await expect(
        session.run(() => pb.send('/api/create', { method: 'POST' }), {
          isDoubtful: (outcome) => 'error' in outcome,
        })
      ).rejects.toMatchObject({ status: 400 });
      // The token is valid: the error is real, the request is not sent again.
      expect(paths(requests)).toEqual([AUTH_PATH, '/api/create', REFRESH_PATH]);
    });
  });
});
