import { MemberValidationError, type MemberInput } from '@/data/member-repository';
import { createPocketBaseMemberRepository } from '@/data/pocketbase-member-repository';
import { createOrganizerSession, createPocketBaseClient } from '@/data/pocketbase-session';
import type { MembersResponse } from '@/lib/pocketbase-types';
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

const MEMBERS_PATH = '/api/collections/members/records';

/** A member record as PocketBase returns it (fictitious data). */
function memberRecord(overrides: Partial<MembersResponse> & Pick<MembersResponse, 'id' | 'name'>) {
  return {
    collectionId: 'pbc_members',
    collectionName: 'members',
    email: '',
    phone: '',
    active: true,
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

const fieldErrors = (data: Record<string, { code: string; message: string }>): FakeResponse => ({
  status: 400,
  body: { status: 400, message: 'Failed to create record.', data },
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
  return { ...server, repository: createPocketBaseMemberRepository(pb, session) };
}

const paul: MemberInput = {
  name: 'Paul Essai',
  phone: '06 39 98 00 05',
  email: 'paul@example.com',
  active: true,
};

/** Echoes the record sent, as PocketBase would after normalizing it. */
const echo =
  (id: string): FakeHandler =>
  (request) => ({
    status: 200,
    body: memberRecord({ id, name: '', ...(request.body as Partial<MembersResponse>) }),
  });

async function rejection(promise: Promise<unknown>): Promise<MemberValidationError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(MemberValidationError);
  return error as MemberValidationError;
}

describe('PocketBase member repository', () => {
  it('lists the members sorted by name, accents ignored, once authenticated', async () => {
    const { requests, repository } = setUp(() => ({
      status: 200,
      body: page([
        memberRecord({ id: 'm1', name: 'Jean Exemple', phone: '+33639980001' }),
        memberRecord({ id: 'm2', name: 'Émile Fictif', email: 'emile@example.com', active: false }),
      ]),
    }));

    const members = await repository.list();

    expect(members).toEqual([
      { id: 'm2', name: 'Émile Fictif', phone: '', email: 'emile@example.com', active: false },
      { id: 'm1', name: 'Jean Exemple', phone: '+33639980001', email: '', active: true },
    ]);
    expect(requests[1]).toMatchObject({ method: 'GET', headers: { Authorization: token } });
    expect(requests[1].path).toMatch(new RegExp(`^${MEMBERS_PATH}\\?.*sort=name`));
  });

  it('creates a member, with the phone number in E.164', async () => {
    const { requests, repository } = setUp(echo('m3'));

    const created = await repository.create(paul);

    expect(requests[1]).toMatchObject({
      method: 'POST',
      path: MEMBERS_PATH,
      headers: { Authorization: token },
      body: { name: 'Paul Essai', phone: '+33639980005', email: 'paul@example.com', active: true },
    });
    expect(created).toEqual({ ...paul, id: 'm3', phone: '+33639980005' });
  });

  it('updates a member', async () => {
    const { requests, repository } = setUp(echo('m3'));

    const updated = await repository.update('m3', { ...paul, email: '', active: false });

    expect(requests[1]).toMatchObject({
      method: 'PATCH',
      path: `${MEMBERS_PATH}/m3`,
      body: { name: 'Paul Essai', phone: '+33639980005', email: '', active: false },
    });
    expect(updated).toMatchObject({ id: 'm3', email: '', active: false });
  });

  it('stops inviting a member without touching the rest', async () => {
    const { requests, repository } = setUp(() => ({
      status: 200,
      body: memberRecord({ id: 'm1', name: 'Jean Exemple', phone: '+33639980001', active: false }),
    }));

    const member = await repository.setActive('m1', false);

    expect(requests[1]).toMatchObject({
      method: 'PATCH',
      path: `${MEMBERS_PATH}/m1`,
      body: { active: false },
    });
    expect(member.active).toBe(false);
  });

  it('deletes a member', async () => {
    const { requests, repository } = setUp(() => ({ status: 204 }));

    await repository.remove('m1');

    expect(requests[1]).toMatchObject({ method: 'DELETE', path: `${MEMBERS_PATH}/m1` });
  });

  it('turns the refusals of the back-end into French messages per field', async () => {
    const { repository } = setUp(() =>
      fieldErrors({
        phone: { code: 'validation_not_unique', message: 'Value must be unique.' },
        email: { code: 'validation_not_unique', message: 'Value must be unique.' },
      })
    );

    expect((await rejection(repository.create(paul))).fields).toEqual({
      phone: "Ce numéro de téléphone est déjà celui d'un autre adhérent.",
      email: "Cette adresse e-mail est déjà celle d'un autre adhérent.",
    });
  });

  it.each([
    [
      { phone: { code: 'invalid_phone', message: 'Must be a French phone number.' } },
      { phone: 'Numéro de téléphone invalide. Exemple : 06 39 98 00 01.' },
    ],
    [
      {
        email: { code: 'missing_contact', message: 'An email or a phone number is required.' },
        phone: { code: 'missing_contact', message: 'An email or a phone number is required.' },
      },
      { phone: 'Indiquez au moins un téléphone ou un e-mail.' },
    ],
    [
      {
        name: { code: 'validation_required', message: 'Cannot be blank.' },
        email: { code: 'validation_invalid_email', message: 'Must be a valid email address.' },
      },
      {
        name: "Indiquez le nom de l'adhérent.",
        email: 'Adresse e-mail invalide. Exemple : prenom.nom@example.com.',
      },
    ],
  ])('translates %j', async (data, expected) => {
    const { repository } = setUp(() => fieldErrors(data));

    expect((await rejection(repository.update('m3', paul))).fields).toEqual(expected);
  });

  it('passes on the other errors', async () => {
    const { repository } = setUp(() => ({ status: 500, body: { status: 500, message: 'Oops.' } }));

    await expect(repository.create(paul)).rejects.not.toBeInstanceOf(MemberValidationError);
  });

  describe('with a token revoked on the server', () => {
    // PocketBase treats a revoked token as a guest: an empty list, a creation refused with a 400,
    // an update or a deletion answered with a 404.
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
      const repository = createPocketBaseMemberRepository(pb, session);
      return { ...server, repository, revoke: () => (revoked = true) };
    }
    const paths = (requests: FakeRequest[]) =>
      requests.map((request) => request.path.replace(/\?.*/, ''));
    const notFound: FakeResponse = {
      status: 404,
      body: { status: 404, message: 'The requested resource was not found.', data: {} },
    };

    it('authenticates again and lists the members instead of an empty list', async () => {
      const { requests, repository, revoke } = revokedServer((_request, guest) => ({
        status: 200,
        body: page(guest ? [] : [memberRecord({ id: 'm1', name: 'Jean Exemple' })]),
      }));
      await repository.list();
      revoke();
      requests.length = 0;

      expect((await repository.list()).map((member) => member.id)).toEqual(['m1']);
      expect(paths(requests)).toEqual([MEMBERS_PATH, REFRESH_PATH, AUTH_PATH, MEMBERS_PATH]);
    });

    it('authenticates again and creates the member instead of failing', async () => {
      const { requests, repository, revoke } = revokedServer((request, guest) =>
        guest ? fieldErrors({}) : echo('m3')(request)
      );
      await repository.list();
      revoke();
      requests.length = 0;

      expect(await repository.create(paul)).toMatchObject({ id: 'm3' });
      expect(paths(requests)).toEqual([MEMBERS_PATH, REFRESH_PATH, AUTH_PATH, MEMBERS_PATH]);
    });

    it('authenticates again and updates, deactivates or deletes the member', async () => {
      const { requests, repository, revoke } = revokedServer((request, guest) =>
        guest ? notFound : request.method === 'DELETE' ? { status: 204 } : echo('m3')(request)
      );
      const M3 = `${MEMBERS_PATH}/m3`;
      await repository.setActive('m3', true);

      revoke();
      requests.length = 0;
      await repository.update('m3', paul);
      expect(paths(requests)).toEqual([M3, REFRESH_PATH, AUTH_PATH, M3]);

      revoke();
      requests.length = 0;
      await repository.setActive('m3', false);
      expect(paths(requests)).toEqual([M3, REFRESH_PATH, AUTH_PATH, M3]);

      revoke();
      requests.length = 0;
      await repository.remove('m3');
      expect(paths(requests)).toEqual([M3, REFRESH_PATH, AUTH_PATH, M3]);
    });

    it('does not check the token when the phone number is taken', async () => {
      const { requests, repository } = revokedServer(() =>
        fieldErrors({ phone: { code: 'validation_not_unique', message: 'Value must be unique.' } })
      );

      await expect(repository.create(paul)).rejects.toBeInstanceOf(MemberValidationError);
      expect(paths(requests)).toEqual([AUTH_PATH, MEMBERS_PATH]);
    });
  });
});
