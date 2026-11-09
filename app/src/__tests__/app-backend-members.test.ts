import { createAppBackend } from '@/data/app-backend';
import { ServerConfigMissingError } from '@/data/server-connection';
import { AUTH_PATH, authSuccess, FAKE_API_URL, fakePocketBase } from '@/test-utils/fake-pocketbase';

describe('app back-end: members', () => {
  it('reads the members from PocketBase with the same organizer session', async () => {
    const { requests } = fakePocketBase((request) =>
      request.path === AUTH_PATH
        ? authSuccess()
        : {
            status: 200,
            body: {
              page: 1,
              perPage: 1000,
              totalItems: -1,
              totalPages: -1,
              items: [
                { id: 'm1', name: 'Jean Exemple', phone: '+33639980001', email: '', active: true },
              ],
            },
          }
    );
    const backend = createAppBackend({
      url: FAKE_API_URL,
      organizerEmail: 'organizer@example.com',
      organizerKey: 'fake-key-for-tests',
    });

    await backend.connection.connect();
    expect(await backend.members.list()).toEqual([
      { id: 'm1', name: 'Jean Exemple', phone: '+33639980001', email: '', active: true },
    ]);

    // A single authentication, shared with the hunts.
    expect(requests.filter((request) => request.path === AUTH_PATH)).toHaveLength(1);
    expect(requests[1].path).toMatch(/^\/api\/collections\/members\/records\?/);
  });

  it('fails clearly without configuration, without any request', async () => {
    const { fetchMock } = fakePocketBase(() => authSuccess());
    const { members } = createAppBackend(null);

    await expect(members.list()).rejects.toBeInstanceOf(ServerConfigMissingError);
    await expect(
      members.create({ name: 'Jean Exemple', phone: '', email: 'jean@example.com', active: true })
    ).rejects.toBeInstanceOf(ServerConfigMissingError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
