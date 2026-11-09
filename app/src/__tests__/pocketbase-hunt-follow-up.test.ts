import { FeatureUnavailableError, HuntActionError, HuntNotFoundError } from '@/data/hunt-follow-up';
import { createPocketBaseHuntFollowUp } from '@/data/pocketbase-hunt-follow-up';
import { createOrganizerSession, createPocketBaseClient } from '@/data/pocketbase-session';
import {
  AUTH_PATH,
  authSuccess,
  FAKE_API_URL,
  fakePocketBase,
  fakeToken,
  REFRESH_PATH,
  unauthorized,
  type FakeHandler,
  type FakeResponse,
} from '@/test-utils/fake-pocketbase';

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
  return { ...server, followUp: createPocketBaseHuntFollowUp(pb, session) };
}

const page = (items: unknown[], totalItems = -1) => ({
  page: 1,
  perPage: 1000,
  totalItems,
  totalPages: -1,
  items,
});

const refusal = (status: number, data: Record<string, unknown> = {}): FakeResponse => ({
  status,
  body: { status, message: 'Refused.', data },
});

/** The query of a request, decoded, without spaces and with double quotes (easier to match). */
const query = (path: string) =>
  decodeURIComponent(path.replace(/^[^?]*\?/, ''))
    .replace(/\s+/g, '')
    .replace(/'/g, '"');

const SUMMARY = {
  invited: 20,
  sms: { sent: 18, failed: 2, skipped: 0 },
  email: { sent: 5, failed: 0, skipped: 15 },
};

/** An invitation record as PocketBase returns it, with its member (fictitious data). */
function invitationRecord(overrides: Record<string, unknown>) {
  return {
    collectionId: 'pbc_invitations',
    collectionName: 'invitations',
    hunt: 'hunt1',
    member: 'member1',
    participation: 'pending',
    answered_at: '',
    answered_via: '',
    sms_status: 'sent',
    email_status: 'skipped',
    token: 'x'.repeat(43),
    created: '2026-11-07 09:00:00.000Z',
    updated: '2026-11-07 09:00:00.000Z',
    expand: { member: { id: 'member1', name: 'Jeanne Fictive' } },
    ...overrides,
  };
}

describe('PocketBase hunt follow-up', () => {
  it('loads a hunt with its status', async () => {
    const { requests, followUp } = setUp(() => ({
      status: 200,
      body: {
        id: 'hunt1',
        date: '2026-11-14',
        meeting_time: '08:00',
        max_participants: 0,
        response_deadline: '2026-11-09 19:00:00.000Z',
        status: 'invitations_sent',
      },
    }));

    await expect(followUp.getHunt('hunt1')).resolves.toEqual({
      id: 'hunt1',
      date: '2026-11-14',
      meeting_time: '08:00',
      max_participants: null,
      response_deadline: '2026-11-09T19:00:00.000Z',
      status: 'invitations_sent',
    });
    expect(requests[1].path).toMatch(/^\/api\/collections\/hunts\/records\/hunt1/);
  });

  it('says when the hunt does not exist', async () => {
    let refreshed = false;
    const { followUp } = setUp((request) => {
      if (request.path === REFRESH_PATH) {
        refreshed = true;
        return authSuccess(token);
      }
      return refusal(404);
    });

    await expect(followUp.getHunt('nope')).rejects.toBeInstanceOf(HuntNotFoundError);
    // A 404 may come from a revoked token: the server was asked to check it.
    expect(refreshed).toBe(true);
  });

  it('lists the invitations of a hunt with the names of the members', async () => {
    const { requests, followUp } = setUp(() => ({
      status: 200,
      body: page([
        invitationRecord({
          id: 'inv1',
          participation: 'present',
          answered_at: '2026-11-08 13:32:00.000Z',
          answered_via: 'sms',
        }),
        invitationRecord({
          id: 'inv2',
          member: 'member2',
          sms_status: 'failed',
          email_status: '',
          expand: { member: { id: 'member2', name: 'Paul Exemple' } },
        }),
      ]),
    }));

    const invitations = await followUp.listInvitations('hunt1');

    expect(invitations).toEqual([
      {
        id: 'inv1',
        participation: 'present',
        answered_at: '2026-11-08T13:32:00.000Z',
        answered_via: 'sms',
        sms_status: 'sent',
        email_status: 'skipped',
        updated: '2026-11-07T09:00:00.000Z',
        member: { id: 'member1', name: 'Jeanne Fictive' },
      },
      {
        id: 'inv2',
        participation: 'pending',
        answered_at: null,
        answered_via: null,
        sms_status: 'failed',
        email_status: null,
        updated: '2026-11-07T09:00:00.000Z',
        member: { id: 'member2', name: 'Paul Exemple' },
      },
    ]);
    expect(query(requests[1].path)).toContain('filter=hunt="hunt1"');
    expect(query(requests[1].path)).toContain('expand=member');
  });

  it('counts the active members', async () => {
    const { requests, followUp } = setUp(() => ({ status: 200, body: page([{ id: 'm1' }], 25) }));

    await expect(followUp.countActiveMembers()).resolves.toBe(25);
    expect(query(requests[1].path)).toContain('filter=active=true');
  });

  it('sends the invitations and returns the summary', async () => {
    const { requests, followUp } = setUp(() => ({ status: 200, body: SUMMARY }));

    await expect(followUp.sendInvitations('hunt1')).resolves.toEqual(SUMMARY);
    expect(requests[1]).toMatchObject({
      method: 'POST',
      path: '/api/diane/hunts/hunt1/send-invitations',
      headers: { Authorization: token },
    });
  });

  it('resends the failed invitations', async () => {
    const { requests, followUp } = setUp(() => ({ status: 200, body: SUMMARY }));

    await expect(followUp.resendFailed('hunt1')).resolves.toEqual(SUMMARY);
    expect(requests[1]).toMatchObject({
      method: 'POST',
      path: '/api/diane/hunts/hunt1/resend-failed',
    });
  });

  it.each(['hunt_cancelled', 'hunt_closed', 'deadline_passed', 'deadline_missing'])(
    'gives the reason of a refused sending (%s)',
    async (code) => {
      const { followUp } = setUp(() => refusal(409, { hunt: { code, message: 'Refused.' } }));

      const sending = followUp.sendInvitations('hunt1');

      await expect(sending).rejects.toBeInstanceOf(HuntActionError);
      await expect(sending).rejects.toMatchObject({ code });
    }
  );

  it('gives the reason when there is no default message template', async () => {
    const { followUp } = setUp(() =>
      refusal(409, { template: { code: 'no_default_template', message: 'Refused.' } })
    );

    await expect(followUp.sendInvitations('hunt1')).rejects.toMatchObject({
      code: 'no_default_template',
    });
  });

  it('says when the server is not configured to send', async () => {
    const { followUp } = setUp(() => refusal(503));

    await expect(followUp.resendFailed('hunt1')).rejects.toMatchObject({
      code: 'server_not_configured',
    });
  });

  it('authenticates again when the token is refused', async () => {
    let calls = 0;
    const { followUp } = setUp((request) => {
      if (request.path === REFRESH_PATH) {
        return authSuccess(token);
      }
      calls += 1;
      return calls === 1 ? unauthorized : { status: 200, body: SUMMARY };
    });

    await expect(followUp.sendInvitations('hunt1')).resolves.toEqual(SUMMARY);
  });

  it('cancels a hunt and returns the summary', async () => {
    const summary = { notified: 15, sms: SUMMARY.sms, email: SUMMARY.email };
    const { requests, followUp } = setUp(() => ({ status: 200, body: summary }));

    await expect(followUp.cancelHunt('hunt1')).resolves.toEqual(summary);
    expect(requests[1]).toMatchObject({ method: 'POST', path: '/api/diane/hunts/hunt1/cancel' });
  });

  it('says when the server cannot cancel a hunt yet', async () => {
    const { followUp } = setUp(() => refusal(404));

    await expect(followUp.cancelHunt('hunt1')).rejects.toBeInstanceOf(FeatureUnavailableError);
  });

  it('records an answer entered by the organizer', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-08T10:00:00.000Z'), advanceTimers: true });
    try {
      const { requests, followUp } = setUp(() => ({
        status: 200,
        body: invitationRecord({ id: 'inv1' }),
      }));

      await followUp.setParticipation('inv1', 'present');

      expect(requests[1]).toMatchObject({
        method: 'PATCH',
        path: '/api/collections/invitations/records/inv1',
        body: {
          participation: 'present',
          answered_via: 'manual',
          answered_at: '2026-11-08 10:00:00.000Z',
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  describe('applying an SMS answer, with the rule of the server', () => {
    /** A server with this invitation and this attendance of its hunt. */
    function applying(current: string, attendance: Record<string, unknown>) {
      return setUp((request) => {
        if (request.path.includes('/attendance')) {
          return {
            status: 200,
            body: { present: 4, waiting_list: [], absent: 0, pending: 0, ...attendance },
          };
        }
        return {
          status: 200,
          body: invitationRecord({ id: 'inv1', participation: current }),
        };
      });
    }

    it.each([
      ['pending', { free_places: 2 }, 'yes', 'present'],
      ['absent', { free_places: 2 }, 'yes', 'present'],
      ['pending', { free_places: null }, 'yes', 'present'],
      ['pending', { free_places: 0 }, 'yes', 'waiting_list'],
      ['pending', { free_places: 1, waiting_list: ['inv9'] }, 'yes', 'waiting_list'],
      ['present', { free_places: 0 }, 'no', 'absent'],
      ['waiting_list', { free_places: 0 }, 'no', 'absent'],
    ])('%s, %j, %s → %s', async (current, attendance, answer, participation) => {
      const { requests, followUp } = applying(current, attendance);

      await followUp.applyAnswer({ id: 'inv1', huntId: 'hunt1' }, answer as 'yes' | 'no');

      expect(requests[requests.length - 1]).toMatchObject({
        method: 'PATCH',
        path: '/api/collections/invitations/records/inv1',
        body: { participation, answered_via: 'sms' },
      });
    });

    it.each([
      ['present', { free_places: 0 }, 'yes'],
      ['waiting_list', { free_places: 0, waiting_list: ['inv1'] }, 'yes'],
      ['waiting_list', { free_places: 1, waiting_list: ['inv1'] }, 'yes'],
      ['absent', { free_places: 1 }, 'no'],
    ])(
      'writes nothing when the answer changes nothing: %s, %j, %s',
      async (current, attendance, answer) => {
        const { requests, followUp } = applying(current, attendance);

        await followUp.applyAnswer({ id: 'inv1', huntId: 'hunt1' }, answer as 'yes' | 'no');

        expect(requests.filter((request) => request.method === 'PATCH')).toEqual([]);
      }
    );
  });

  it('lists the unresolved SMS to check, newest first', async () => {
    const { requests, followUp } = setUp(() => ({
      status: 200,
      body: page([
        {
          id: 'sms1',
          from_phone: '+33639981234',
          body: 'Oui si il fait beau',
          received_at: '2026-11-08 07:15:00.000Z',
          member: 'member1',
          reason: 'ambiguous',
          resolved: false,
          expand: { member: { id: 'member1', name: 'Jeanne Fictive' } },
        },
        {
          id: 'sms2',
          from_phone: '+33639985678',
          body: 'OUI',
          received_at: '2026-11-08 06:00:00.000Z',
          member: '',
          resolved: false,
        },
      ]),
    }));

    const items = await followUp.listReviewItems();

    expect(items).toEqual([
      {
        id: 'sms1',
        from_phone: '+33639981234',
        body: 'Oui si il fait beau',
        received_at: '2026-11-08T07:15:00.000Z',
        reason: 'ambiguous',
        member: { id: 'member1', name: 'Jeanne Fictive' },
      },
      {
        id: 'sms2',
        from_phone: '+33639985678',
        body: 'OUI',
        received_at: '2026-11-08T06:00:00.000Z',
        // No reason recorded.
        reason: null,
        member: null,
      },
    ]);
    expect(query(requests[1].path)).toContain('filter=resolved=false');
    expect(query(requests[1].path)).toContain('sort=-received_at');
  });

  it('marks an SMS as handled', async () => {
    const { requests, followUp } = setUp(() => ({ status: 200, body: { id: 'sms1' } }));

    await followUp.resolveReviewItem('sms1');

    expect(requests[1]).toMatchObject({
      method: 'PATCH',
      path: '/api/collections/sms_review_queue/records/sms1',
      body: { resolved: true },
    });
  });

  it('lists the open invitations of a member, with their hunt', async () => {
    const { requests, followUp } = setUp(() => ({
      status: 200,
      body: page([
        invitationRecord({
          id: 'inv1',
          expand: { hunt: { id: 'hunt1', date: '2026-11-14' } },
        }),
      ]),
    }));

    await expect(followUp.listOpenInvitations('member1', '2026-11-08')).resolves.toEqual([
      { id: 'inv1', huntId: 'hunt1', huntDate: '2026-11-14' },
    ]);
    const sent = query(requests[1].path);
    expect(sent).toContain('member="member1"');
    expect(sent).toContain('hunt.date>="2026-11-08"');
    expect(sent).toContain('hunt.status!="cancelled"');
    expect(sent).toContain('expand=hunt');
    expect(sent).toContain('sort=hunt.date');
  });
});
