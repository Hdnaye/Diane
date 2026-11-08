import { ClientResponseError } from 'pocketbase';

import { createPocketBaseClient, createOrganizerSession } from '@/data/pocketbase-session';
import {
  AUTH_PATH,
  authSuccess,
  FAKE_API_URL,
  fakePocketBase,
  fakeToken,
  tooManyRequests,
} from '@/test-utils/fake-pocketbase';

const credentials = { organizerEmail: 'organizer@example.com', organizerKey: 'fake-key-for-tests' };

function setUp(options: Parameters<typeof createOrganizerSession>[2] = {}) {
  const pb = createPocketBaseClient(FAKE_API_URL);
  return { pb, session: createOrganizerSession(pb, credentials, { retryDelayMs: 0, ...options }) };
}

const authRequests = (requests: { path: string }[]) =>
  requests.filter((request) => request.path === AUTH_PATH);

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
});
