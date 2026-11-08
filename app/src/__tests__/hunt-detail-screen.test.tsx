import { act, fireEvent, userEvent, within } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import HuntDetailScreen from '@/app/hunts/[id]';
import {
  createInMemoryHuntFollowUp,
  FeatureUnavailableError,
  HuntActionError,
  type HuntDetail,
  type HuntFollowUpRepository,
  type SendSummary,
} from '@/data/hunt-follow-up';
import { ATTENDANCE_REFRESH_MS } from '@/data/hunt-follow-up-queries';
import { freezeDate, unfreezeDate } from '@/test-utils/clock';
import { renderScreens } from '@/test-utils/router';

// Sunday 8 November 2026, 10:00 in Paris (the tests run with the phone in New York).
const TODAY = new Date('2026-11-08T09:00:00Z');

const routes = { 'hunts/[id]': HuntDetailScreen };

function aHuntDetail(overrides: Partial<HuntDetail> = {}): HuntDetail {
  return {
    id: 'hunt1',
    date: '2026-11-14',
    meeting_time: '08:00',
    max_participants: 12,
    response_deadline: '2026-11-10T19:00:00.000Z',
    status: 'draft',
    ...overrides,
  };
}

// Fictitious members.
const JEANNE = { id: 'm1', name: 'Jeanne Fictive' };
const PAUL = { id: 'm2', name: 'Paul Exemple' };
const MARC = { id: 'm3', name: 'Marc Essai' };
const LUCIE = { id: 'm4', name: 'Lucie Démo' };
const HENRI = { id: 'm5', name: 'Henri Test' };

/** A hunt whose invitations were sent, with one member in each group. */
function sentHunt(overrides: Partial<HuntDetail> = {}) {
  return createInMemoryHuntFollowUp({
    hunts: [aHuntDetail({ status: 'invitations_sent', max_participants: 2, ...overrides })],
    members: [JEANNE, PAUL, MARC, LUCIE, HENRI],
    invitations: [
      {
        id: 'i1',
        huntId: 'hunt1',
        member: JEANNE,
        participation: 'present',
        answered_via: 'sms',
        answered_at: '2026-11-07T13:32:00.000Z',
      },
      {
        id: 'i2',
        huntId: 'hunt1',
        member: PAUL,
        participation: 'present',
        answered_via: 'web',
        answered_at: '2026-11-07T15:00:00.000Z',
      },
      {
        id: 'i3',
        huntId: 'hunt1',
        member: MARC,
        participation: 'waiting_list',
        answered_via: 'web',
        answered_at: '2026-11-07T16:00:00.000Z',
      },
      {
        id: 'i4',
        huntId: 'hunt1',
        member: LUCIE,
        participation: 'absent',
        answered_via: 'sms',
        answered_at: '2026-11-07T17:00:00.000Z',
      },
      { id: 'i5', huntId: 'hunt1', member: HENRI, sms_status: 'failed', email_status: 'skipped' },
    ],
  });
}

function openHunt(followUp: HuntFollowUpRepository) {
  return renderScreens(routes, { initialUrl: '/hunts/hunt1', followUp });
}

/** The list of a group of answers (its heading, then its members). */
function group(name: RegExp) {
  return within(screen.getByRole('list', { name }));
}

describe('HuntDetailScreen', () => {
  beforeEach(() => freezeDate(TODAY));
  afterEach(unfreezeDate);

  describe('hunt', () => {
    it('shows the day, the meeting time, the places, the deadline and the status', async () => {
      await openHunt(createInMemoryHuntFollowUp({ hunts: [aHuntDetail()] }));

      expect(
        await screen.findByRole('heading', { name: 'Battue du samedi 14 novembre' })
      ).toBeOnTheScreen();
      expect(screen.getByText('Rendez-vous à 8 h 00')).toBeOnTheScreen();
      expect(screen.getByText('12 places au maximum')).toBeOnTheScreen();
      expect(screen.getByText("Réponses jusqu'au mardi 10 novembre à 20 h 00")).toBeOnTheScreen();
      expect(screen.getByText('Brouillon')).toBeOnTheScreen();
    });

    it.each([
      ['invitations_sent', 'Invitations envoyées'],
      ['cancelled', 'Annulée'],
      ['closed', 'Terminée'],
    ] as const)('shows the status %s', async (status, label) => {
      await openHunt(createInMemoryHuntFollowUp({ hunts: [aHuntDetail({ status })] }));

      expect(await screen.findByText(label)).toBeOnTheScreen();
    });

    it('says when there is no limit of places, nor deadline yet', async () => {
      await openHunt(
        createInMemoryHuntFollowUp({
          hunts: [aHuntDetail({ max_participants: null, response_deadline: '' })],
        })
      );

      expect(await screen.findByText('Sans limite de places')).toBeOnTheScreen();
      expect(screen.getByText("Date limite fixée à l'envoi des invitations")).toBeOnTheScreen();
    });

    it('says when the hunt does not exist', async () => {
      await openHunt(createInMemoryHuntFollowUp());

      expect(
        await screen.findByText("Cette battue n'existe pas ou a été supprimée.")
      ).toBeOnTheScreen();
    });
  });

  describe('sending the invitations', () => {
    const draft = () =>
      createInMemoryHuntFollowUp({ hunts: [aHuntDetail()], members: [JEANNE, PAUL, MARC] });

    it('asks for a confirmation, sends, then shows a summary and the invited members', async () => {
      const user = userEvent.setup();
      await openHunt(draft());

      await user.press(await screen.findByRole('button', { name: 'Envoyer les invitations' }));
      expect(
        await screen.findByText("Envoyer l'invitation par SMS et e-mail à 3 adhérents actifs ?")
      ).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Envoyer' }));

      expect(
        await screen.findByText('3 adhérents invités : 3 SMS envoyés, 3 e-mails envoyés.')
      ).toBeOnTheScreen();
      expect(screen.getByText('Invitations envoyées')).toBeOnTheScreen();
      expect(
        screen.queryByRole('button', { name: 'Envoyer les invitations' })
      ).not.toBeOnTheScreen();
      expect(group(/Sans réponse/).getByText('Jeanne Fictive')).toBeOnTheScreen();
    });

    it('sends nothing when the organizer changes his mind', async () => {
      const user = userEvent.setup();
      const followUp = draft();
      const send = jest.spyOn(followUp, 'sendInvitations');
      await openHunt(followUp);

      await user.press(await screen.findByRole('button', { name: 'Envoyer les invitations' }));
      await user.press(await screen.findByRole('button', { name: 'Ne pas envoyer' }));

      expect(screen.queryByText(/^Envoyer l\'invitation par SMS/)).not.toBeOnTheScreen();
      expect(send).not.toHaveBeenCalled();
    });

    it('says the sending is in progress and never sends twice', async () => {
      const user = userEvent.setup();
      const followUp = draft();
      let finish: (summary: SendSummary) => void = () => {};
      const send = jest
        .spyOn(followUp, 'sendInvitations')
        .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
      await openHunt(followUp);

      await user.press(await screen.findByRole('button', { name: 'Envoyer les invitations' }));
      await user.press(await screen.findByRole('button', { name: 'Envoyer' }));

      expect(
        await screen.findByText('Envoi en cours… Cela peut prendre quelques secondes.')
      ).toBeOnTheScreen();
      const sending = screen.getByRole('button', { name: 'Envoi en cours' });
      expect(sending).toBeDisabled();
      await user.press(sending);
      expect(send).toHaveBeenCalledTimes(1);

      await act(async () =>
        finish({
          invited: 20,
          sms: { sent: 18, failed: 2, skipped: 0 },
          email: { sent: 5, failed: 1, skipped: 14 },
        })
      );

      expect(
        await screen.findByText(
          '20 adhérents invités : 18 SMS envoyés, 2 SMS non envoyés, 5 e-mails envoyés, 1 e-mail non envoyé.'
        )
      ).toBeOnTheScreen();
    });

    it.each([
      [
        'deadline_missing',
        'Pas de date limite de réponse, et il est trop tard pour en fixer une avant la battue.',
      ],
      [
        'deadline_passed',
        'La date limite de réponse est dépassée : les invitations ne peuvent plus partir.',
      ],
      ['hunt_cancelled', 'Cette battue est annulée : les invitations ne peuvent pas partir.'],
      ['hunt_closed', 'Cette battue est terminée : les invitations ne peuvent pas partir.'],
      [
        'server_not_configured',
        "Le serveur n'est pas configuré pour envoyer les invitations (adresse publique manquante).",
      ],
    ])('explains a refused sending (%s)', async (code, message) => {
      const user = userEvent.setup();
      const followUp = draft();
      jest.spyOn(followUp, 'sendInvitations').mockRejectedValue(new HuntActionError(code));
      await openHunt(followUp);

      await user.press(await screen.findByRole('button', { name: 'Envoyer les invitations' }));
      await user.press(await screen.findByRole('button', { name: 'Envoyer' }));

      expect(await screen.findByText(message)).toBeOnTheScreen();
    });

    it('says when the server cannot be reached', async () => {
      const user = userEvent.setup();
      const followUp = draft();
      jest.spyOn(followUp, 'sendInvitations').mockRejectedValue(new Error('network down'));
      await openHunt(followUp);

      await user.press(await screen.findByRole('button', { name: 'Envoyer les invitations' }));
      await user.press(await screen.findByRole('button', { name: 'Envoyer' }));

      expect(
        await screen.findByText(
          "L'envoi n'a pas pu se faire. Vérifiez la connexion, puis réessayez."
        )
      ).toBeOnTheScreen();
    });

    it('resends the failed invitations', async () => {
      const user = userEvent.setup();
      await openHunt(sentHunt());

      expect(await group(/Sans réponse/).findByText('SMS non envoyé')).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Renvoyer les échecs' }));

      expect(await screen.findByText('1 invitation renvoyée : 1 SMS envoyé.')).toBeOnTheScreen();
      expect(screen.queryByText('SMS non envoyé')).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Renvoyer les échecs' })).not.toBeOnTheScreen();
    });
  });

  describe('answers', () => {
    it('counts the answers, then lists the members by group with how and when they answered', async () => {
      await openHunt(sentHunt());

      expect(await screen.findByLabelText('Présents : 2 sur 2 places')).toBeOnTheScreen();
      expect(screen.getByLabelText("Liste d'attente : 1")).toBeOnTheScreen();
      expect(screen.getByLabelText('Absents : 1')).toBeOnTheScreen();
      expect(screen.getByLabelText('Sans réponse : 1')).toBeOnTheScreen();

      const present = group(/^Présents/);
      expect(present.getAllByText('Présent')).toHaveLength(2);
      expect(present.getByText('Jeanne Fictive')).toBeOnTheScreen();
      expect(present.getByText('Par SMS, samedi 7 novembre à 14 h 32')).toBeOnTheScreen();
      expect(present.getByText('Par le lien, samedi 7 novembre à 16 h 00')).toBeOnTheScreen();
      expect(group(/^Liste d\'attente/).getByText('Marc Essai')).toBeOnTheScreen();
      expect(group(/^Absents/).getByText('Lucie Démo')).toBeOnTheScreen();
      expect(group(/^Sans réponse/).getByText('Henri Test')).toBeOnTheScreen();
    });

    it('refreshes the answers regularly', async () => {
      jest.useFakeTimers({ now: TODAY, advanceTimers: true });
      const followUp = sentHunt();
      await openHunt(followUp);
      expect(await screen.findByLabelText('Sans réponse : 1')).toBeOnTheScreen();

      // Henri answers no from his link.
      await followUp.applyAnswer({ id: 'i5', huntId: 'hunt1' }, 'no');
      await act(() => jest.advanceTimersByTimeAsync(ATTENDANCE_REFRESH_MS));

      expect(await screen.findByLabelText('Absents : 2')).toBeOnTheScreen();
      expect(screen.getByLabelText('Sans réponse : 0')).toBeOnTheScreen();
    });

    it('refreshes the answers when pulled down', async () => {
      const followUp = sentHunt();
      await openHunt(followUp);
      expect(await screen.findByLabelText('Sans réponse : 1')).toBeOnTheScreen();

      await followUp.applyAnswer({ id: 'i5', huntId: 'hunt1' }, 'no');
      await act(async () => {
        fireEvent(screen.getByTestId('hunt-detail-refresh'), 'refresh');
      });

      expect(await screen.findByLabelText('Absents : 2')).toBeOnTheScreen();
    });
  });

  describe('answers entered by the organizer', () => {
    it('marks a member present or absent', async () => {
      const user = userEvent.setup();
      await openHunt(sentHunt({ max_participants: null }));

      await user.press(await screen.findByRole('button', { name: 'Marquer présent : Henri Test' }));
      expect(await group(/^Présents/).findByText('Henri Test')).toBeOnTheScreen();
      expect(group(/^Présents/).getByText(/^Saisi par vous/)).toBeOnTheScreen();

      await user.press(screen.getByRole('button', { name: 'Marquer absent : Henri Test' }));
      expect(await group(/^Absents/).findByText('Henri Test')).toBeOnTheScreen();
    });

    it('moves a member up from the waiting list when a place is free', async () => {
      const user = userEvent.setup();
      await openHunt(sentHunt({ max_participants: 3 }));

      await user.press(await screen.findByRole('button', { name: 'Faire monter : Marc Essai' }));

      expect(await group(/^Présents/).findByText('Marc Essai')).toBeOnTheScreen();
      expect(screen.getByLabelText('Présents : 3 sur 3 places')).toBeOnTheScreen();
    });

    it('warns when the hunt is full before moving a member up', async () => {
      const user = userEvent.setup();
      await openHunt(sentHunt());

      await user.press(await screen.findByRole('button', { name: 'Faire monter : Marc Essai' }));
      expect(
        await screen.findByText(
          'La battue est complète (2 places sur 2). Faire monter Marc Essai quand même ?'
        )
      ).toBeOnTheScreen();
      expect(group(/^Liste d\'attente/).getByText('Marc Essai')).toBeOnTheScreen();

      await user.press(screen.getByRole('button', { name: 'Oui, faire monter' }));

      expect(await group(/^Présents/).findByText('Marc Essai')).toBeOnTheScreen();
      expect(screen.getByLabelText('Présents : 3 sur 2 places')).toBeOnTheScreen();
    });

    it('leaves the member on the waiting list when the organizer changes his mind', async () => {
      const user = userEvent.setup();
      await openHunt(sentHunt());

      await user.press(await screen.findByRole('button', { name: 'Faire monter : Marc Essai' }));
      await user.press(await screen.findByRole('button', { name: 'Non' }));

      expect(screen.queryByText(/quand même/)).not.toBeOnTheScreen();
      expect(group(/^Liste d\'attente/).getByText('Marc Essai')).toBeOnTheScreen();
    });
  });

  describe('cancellation', () => {
    it('asks for a strong confirmation, cancels, then shows a summary', async () => {
      const user = userEvent.setup();
      await openHunt(sentHunt());

      await user.press(await screen.findByRole('button', { name: 'Annuler la battue' }));
      expect(
        await screen.findByText(
          "Annuler la battue du samedi 14 novembre ? Les invités qui n'ont pas répondu NON seront prévenus par SMS et e-mail. Cette action est définitive."
        )
      ).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Oui, annuler la battue' }));

      expect(
        await screen.findByText(
          'Battue annulée. 4 adhérents prévenus : 4 SMS envoyés, 4 e-mails envoyés.'
        )
      ).toBeOnTheScreen();
      expect(screen.getByText('Annulée')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Annuler la battue' })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /^Marquer/ })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Renvoyer les échecs' })).not.toBeOnTheScreen();
    });

    it('keeps the hunt when the organizer changes his mind', async () => {
      const user = userEvent.setup();
      const followUp = sentHunt();
      const cancel = jest.spyOn(followUp, 'cancelHunt');
      await openHunt(followUp);

      await user.press(await screen.findByRole('button', { name: 'Annuler la battue' }));
      await user.press(await screen.findByRole('button', { name: 'Non, garder la battue' }));

      expect(cancel).not.toHaveBeenCalled();
      expect(screen.getByText('Invitations envoyées')).toBeOnTheScreen();
    });

    it('says when the server cannot cancel a hunt yet', async () => {
      const user = userEvent.setup();
      const followUp = sentHunt();
      jest.spyOn(followUp, 'cancelHunt').mockRejectedValue(new FeatureUnavailableError('cancel'));
      await openHunt(followUp);

      await user.press(await screen.findByRole('button', { name: 'Annuler la battue' }));
      await user.press(await screen.findByRole('button', { name: 'Oui, annuler la battue' }));

      expect(
        await screen.findByText(
          "Fonction pas encore disponible sur le serveur : la battue n'a pas été annulée."
        )
      ).toBeOnTheScreen();
    });
  });
});
