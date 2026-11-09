import { createInMemoryHuntFollowUp, type HuntDetail } from '@/data/hunt-follow-up';

// The in-memory follow-up stands in for the server in the screen tests: it behaves like it.
const aHunt = (overrides: Partial<HuntDetail> = {}): HuntDetail => ({
  id: 'hunt1',
  date: '2026-11-14',
  meeting_time: '08:00',
  max_participants: null,
  response_deadline: '2026-11-10T19:00:00.000Z',
  status: 'draft',
  ...overrides,
});

// Fictitious members.
const JEANNE = { id: 'm1', name: 'Jeanne Fictive' };
const PAUL = { id: 'm2', name: 'Paul Exemple' };

describe('in-memory hunt follow-up', () => {
  it('marks the hunt as sent and claims the channels before anything goes out', async () => {
    let letItGo: (value?: unknown) => void = () => {};
    const followUp = createInMemoryHuntFollowUp({
      hunts: [aHunt()],
      members: [JEANNE],
      sendingHeldUntil: new Promise((resolve) => (letItGo = resolve)),
    });

    const sending = followUp.sendInvitations('hunt1');
    await Promise.resolve();

    expect((await followUp.getHunt('hunt1')).status).toBe('invitations_sent');
    expect(await followUp.listInvitations('hunt1')).toMatchObject([
      { sms_status: 'sending', email_status: 'sending' },
    ]);

    letItGo();
    await expect(sending).resolves.toMatchObject({ invited: 1 });
    expect(await followUp.listInvitations('hunt1')).toMatchObject([
      { sms_status: 'sent', email_status: 'sent' },
    ]);
  });

  it('refuses to send for a closed hunt, without changing its status', async () => {
    const followUp = createInMemoryHuntFollowUp({ hunts: [aHunt({ status: 'closed' })] });

    await expect(followUp.sendInvitations('hunt1')).rejects.toMatchObject({ code: 'hunt_closed' });
    expect((await followUp.getHunt('hunt1')).status).toBe('closed');
  });

  it('always gives the messages not attempted in its summaries', async () => {
    const followUp = createInMemoryHuntFollowUp({ hunts: [aHunt()], members: [JEANNE] });

    await expect(followUp.sendInvitations('hunt1')).resolves.toMatchObject({
      sms: { not_sent: 0 },
      email: { not_sent: 0 },
    });
  });

  it('does not resend to an inactive member', async () => {
    const followUp = createInMemoryHuntFollowUp({
      hunts: [aHunt({ status: 'invitations_sent' })],
      members: [{ ...JEANNE, active: false }, PAUL],
      invitations: [
        { id: 'i1', huntId: 'hunt1', member: JEANNE, sms_status: 'failed' },
        { id: 'i2', huntId: 'hunt1', member: PAUL, sms_status: 'failed' },
      ],
    });

    await expect(followUp.resendFailed('hunt1')).resolves.toMatchObject({ invited: 1 });
    expect((await followUp.listInvitations('hunt1')).map((item) => item.sms_status)).toEqual([
      'failed',
      'sent',
    ]);
  });

  it('updates an invitation when it changes', async () => {
    const followUp = createInMemoryHuntFollowUp({
      hunts: [aHunt({ status: 'invitations_sent' })],
      members: [JEANNE],
      invitations: [
        {
          id: 'i1',
          huntId: 'hunt1',
          member: JEANNE,
          sms_status: 'failed',
          updated: '2026-11-01T10:00:00.000Z',
        },
      ],
    });

    await followUp.resendFailed('hunt1');

    const [invitation] = await followUp.listInvitations('hunt1');
    expect(invitation.updated).not.toBe('2026-11-01T10:00:00.000Z');
  });
});
