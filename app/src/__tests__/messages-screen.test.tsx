import { userEvent, within } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import MessagesScreen from '@/app/messages';
import {
  createInMemoryHuntFollowUp,
  type HuntDetail,
  type ReviewItem,
} from '@/data/hunt-follow-up';
import { freezeDate, unfreezeDate } from '@/test-utils/clock';
import { renderScreens } from '@/test-utils/router';

// Sunday 8 November 2026, 10:00 in Paris (the tests run with the phone in New York).
const TODAY = new Date('2026-11-08T09:00:00Z');

// Fictitious members, numbers in the range reserved for fiction (ARCEP).
const JEANNE = { id: 'm1', name: 'Jeanne Fictive' };
const PAUL = { id: 'm2', name: 'Paul Exemple' };

const hunt = (id: string, date: string): HuntDetail => ({
  id,
  date,
  meeting_time: '08:00',
  max_participants: 12,
  response_deadline: '2026-11-10T19:00:00.000Z',
  status: 'invitations_sent',
});

const FROM_JEANNE: ReviewItem = {
  id: 's1',
  from_phone: '+33639981234',
  body: 'Oui si il fait beau',
  received_at: '2026-11-08T07:15:00.000Z',
  reason: 'ambiguous',
  member: JEANNE,
};

const FROM_UNKNOWN: ReviewItem = {
  id: 's2',
  from_phone: '+33639985678',
  body: 'OUI',
  received_at: '2026-11-08T06:00:00.000Z',
  reason: 'unknown_sender',
  member: null,
};

function openMessages(followUp = createInMemoryHuntFollowUp()) {
  return renderScreens({ messages: MessagesScreen }, { initialUrl: '/messages', followUp });
}

/** The card of the message sent by `sender`. */
function message(sender: string) {
  return within(screen.getByLabelText(`Message de ${sender}`));
}

describe('MessagesScreen', () => {
  beforeEach(() => freezeDate(TODAY));
  afterEach(unfreezeDate);

  it('lists the SMS to check, newest first, with their date, sender, text and reason', async () => {
    await openMessages(createInMemoryHuntFollowUp({ reviewItems: [FROM_UNKNOWN, FROM_JEANNE] }));

    expect(await screen.findByRole('heading', { name: 'Messages à vérifier' })).toBeOnTheScreen();
    const senders = await screen.findAllByLabelText(/^Message de /);
    expect(senders.map((card) => card.props['aria-label'])).toEqual([
      'Message de Jeanne Fictive',
      'Message de 06 39 98 56 78',
    ]);
    const jeanne = message('Jeanne Fictive');
    expect(jeanne.getByText('dimanche 8 novembre à 8 h 15')).toBeOnTheScreen();
    expect(jeanne.getByText('« Oui si il fait beau »')).toBeOnTheScreen();
    expect(jeanne.getByText('Réponse ambiguë ou conditionnelle')).toBeOnTheScreen();
    const unknown = message('06 39 98 56 78');
    expect(unknown.getByText('« OUI »')).toBeOnTheScreen();
    expect(unknown.getByText('Numéro inconnu')).toBeOnTheScreen();
    // An unknown sender has no invitation to apply the answer to.
    expect(unknown.queryByRole('button', { name: /^Appliquer/ })).not.toBeOnTheScreen();
  });

  it('says when there is nothing to check', async () => {
    await openMessages();

    expect(await screen.findByText('Aucun message à vérifier.')).toBeOnTheScreen();
  });

  it('marks a message as handled', async () => {
    const user = userEvent.setup();
    await openMessages(createInMemoryHuntFollowUp({ reviewItems: [FROM_UNKNOWN, FROM_JEANNE] }));

    await user.press(
      await screen.findByRole('button', { name: 'Marquer comme traité : 06 39 98 56 78' })
    );

    expect(await screen.findByText('Message marqué comme traité.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Message de 06 39 98 56 78')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Message de Jeanne Fictive')).toBeOnTheScreen();
  });

  it("applies the answer to the member's only open invitation", async () => {
    const user = userEvent.setup();
    const followUp = createInMemoryHuntFollowUp({
      hunts: [hunt('hunt1', '2026-11-14')],
      members: [JEANNE],
      invitations: [{ id: 'i1', huntId: 'hunt1', member: JEANNE }],
      reviewItems: [FROM_JEANNE],
    });
    await openMessages(followUp);

    expect(await screen.findByText('Battue du samedi 14 novembre')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Appliquer OUI : Jeanne Fictive' }));

    expect(
      await screen.findByText('Réponse OUI appliquée à la battue du samedi 14 novembre.')
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Message de Jeanne Fictive')).not.toBeOnTheScreen();
    const [invitation] = await followUp.listInvitations('hunt1');
    expect(invitation).toMatchObject({ participation: 'present', answered_via: 'sms' });
  });

  it('asks which hunt when the member has several open invitations', async () => {
    const user = userEvent.setup();
    const followUp = createInMemoryHuntFollowUp({
      hunts: [hunt('hunt1', '2026-11-14'), hunt('hunt2', '2026-11-21')],
      members: [JEANNE],
      invitations: [
        { id: 'i1', huntId: 'hunt1', member: JEANNE },
        { id: 'i2', huntId: 'hunt2', member: JEANNE },
      ],
      reviewItems: [FROM_JEANNE],
    });
    await openMessages(followUp);

    expect(await screen.findByRole('radio', { name: 'samedi 14 novembre' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Appliquer NON : Jeanne Fictive' })).toBeDisabled();

    await user.press(screen.getByRole('radio', { name: 'samedi 21 novembre' }));
    expect(screen.getByRole('radio', { name: 'samedi 21 novembre' })).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Appliquer NON : Jeanne Fictive' }));

    expect(
      await screen.findByText('Réponse NON appliquée à la battue du samedi 21 novembre.')
    ).toBeOnTheScreen();
    expect((await followUp.listInvitations('hunt2'))[0].participation).toBe('absent');
    expect((await followUp.listInvitations('hunt1'))[0].participation).toBe('pending');
  });

  it('says when the member has no open invitation', async () => {
    await openMessages(
      createInMemoryHuntFollowUp({ members: [JEANNE, PAUL], reviewItems: [FROM_JEANNE] })
    );

    expect(
      await screen.findByText('Pas de battue ouverte à laquelle appliquer la réponse.')
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Appliquer/ })).not.toBeOnTheScreen();
  });
});
