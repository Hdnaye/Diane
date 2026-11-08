import { createAppBackend } from '@/data/app-backend';
import { ServerConfigMissingError } from '@/data/server-connection';
import {
  AUTH_PATH,
  authSuccess,
  FAKE_API_URL,
  fakePocketBase,
  REFRESH_PATH,
} from '@/test-utils/fake-pocketbase';

describe('app back-end', () => {
  it('connects to PocketBase with the configured organizer', async () => {
    const { requests } = fakePocketBase((request) =>
      request.path === AUTH_PATH
        ? authSuccess()
        : {
            status: 200,
            body: { page: 1, perPage: 1000, totalItems: -1, totalPages: -1, items: [] },
          }
    );
    const backend = createAppBackend({
      url: FAKE_API_URL,
      organizerEmail: 'organizer@example.com',
      organizerKey: 'fake-key-for-tests',
    });

    await backend.connection.connect();
    expect(await backend.repository.list()).toEqual([]);

    expect(requests.map((request) => request.path)).toEqual([
      AUTH_PATH,
      expect.stringMatching(/^\/api\/collections\/hunts\/records\?/),
      // An empty list may come from a revoked token: the server checks it.
      REFRESH_PATH,
    ]);
  });

  it('fails clearly without configuration, without any request', async () => {
    const { fetchMock } = fakePocketBase(() => authSuccess());
    const backend = createAppBackend(null);

    await expect(backend.connection.connect()).rejects.toBeInstanceOf(ServerConfigMissingError);
    await expect(backend.repository.list()).rejects.toBeInstanceOf(ServerConfigMissingError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
