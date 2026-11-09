import { act, userEvent } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import HomeScreen from '@/app/index';
import NewHuntScreen from '@/app/hunts/new';
import { createInMemoryHuntFollowUp } from '@/data/hunt-follow-up';
import { REVIEW_REFRESH_MS } from '@/data/hunt-follow-up-queries';
import type { HuntRepository } from '@/data/hunt-repository';
import { ServerConfigMissingError, type ServerConnection } from '@/data/server-connection';
import type { Hunt } from '@/data/types';
import { freezeDate, unfreezeDate } from '@/test-utils/clock';
import { aHunt, renderScreens } from '@/test-utils/router';

// Saturday 7 November 2026, 10:00 in Paris (the tests run with the phone in New York).
const TODAY = new Date('2026-11-07T09:00:00Z');

const HUNTS = [
  aHunt({ date: '2026-10-31' }),
  aHunt({ date: '2026-11-21', meeting_time: '07:30' }),
  aHunt({ date: '2026-11-14', meeting_time: '08:00', max_participants: 12 }),
];

function NewHuntStub() {
  return <Text>Formulaire de création</Text>;
}

function HuntStub() {
  return <Text>Fiche de la battue</Text>;
}

function MessagesStub() {
  return <Text>Liste des messages</Text>;
}

describe('HomeScreen', () => {
  beforeEach(() => freezeDate(TODAY));
  afterEach(unfreezeDate);

  it('shows the app name, the calendar and a button to create a hunt', async () => {
    await renderScreens({ index: HomeScreen });

    expect(screen.getByRole('heading', { name: 'Diane' })).toBeOnTheScreen();
    expect(screen.getByText('novembre 2026', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Créer une battue' })).toBeOnTheScreen();
  });

  it('lists the upcoming hunts by date, with their time and their places', async () => {
    await renderScreens({ index: HomeScreen }, { hunts: HUNTS });

    expect(await screen.findByRole('heading', { name: 'Prochaines battues' })).toBeOnTheScreen();
    const titles = await screen.findAllByRole('heading', { name: /^samedi/ });
    expect(titles.map((title) => title.props.children)).toEqual([
      'samedi 14 novembre',
      'samedi 21 novembre',
    ]);
    expect(screen.getByText('Rendez-vous à 8 h 00')).toBeOnTheScreen();
    expect(screen.getByText('12 places au maximum')).toBeOnTheScreen();
    expect(screen.getByText('Rendez-vous à 7 h 30')).toBeOnTheScreen();
    expect(screen.getAllByText(/places au maximum/)).toHaveLength(1);
    // Past hunts are not listed.
    expect(screen.queryByText('samedi 31 octobre')).not.toBeOnTheScreen();
  });

  it('says when no hunt is planned', async () => {
    await renderScreens({ index: HomeScreen });

    expect(await screen.findByText('Aucune battue prévue.')).toBeOnTheScreen();
  });

  it('says the hunts are loading, without claiming there is none', async () => {
    const repository: HuntRepository = {
      list: () => new Promise<Hunt[]>(() => {}),
      create: jest.fn(),
    };
    await renderScreens({ index: HomeScreen }, { repository });

    expect(await screen.findByText('Chargement des battues…')).toBeOnTheScreen();
    expect(screen.queryByText('Aucune battue prévue.')).not.toBeOnTheScreen();
  });

  it('says when the hunts cannot be loaded and lets the organizer retry', async () => {
    const user = userEvent.setup();
    const repository: HuntRepository = {
      list: jest
        .fn<Promise<Hunt[]>, []>()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue([aHunt({ date: '2026-11-14' })]),
      create: jest.fn(),
    };
    await renderScreens({ index: HomeScreen }, { repository });

    expect(
      await screen.findByText('Impossible de charger les battues. Vérifiez la connexion.')
    ).toBeOnTheScreen();
    expect(screen.queryByText('Aucune battue prévue.')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByRole('heading', { name: 'samedi 14 novembre' })).toBeOnTheScreen();
    expect(
      screen.queryByText('Impossible de charger les battues. Vérifiez la connexion.')
    ).not.toBeOnTheScreen();
  });

  it('marks the hunt days in the calendar, and opens a hunt from its day', async () => {
    const user = userEvent.setup();
    await renderScreens({ index: HomeScreen, 'hunts/[id]': HuntStub }, { hunts: HUNTS });

    await user.press(
      await screen.findByRole('button', { name: 'samedi 14 novembre 2026, battue prévue' })
    );

    expect(await screen.findByText('Fiche de la battue')).toBeOnTheScreen();
    expect(screen).toHavePathname('/hunts/hunt-2026-11-14');
  });

  it('opens a hunt from its card', async () => {
    const user = userEvent.setup();
    await renderScreens({ index: HomeScreen, 'hunts/[id]': HuntStub }, { hunts: HUNTS });

    await user.press(
      await screen.findByRole('button', { name: 'Ouvrir la battue du samedi 21 novembre' })
    );

    expect(await screen.findByText('Fiche de la battue')).toBeOnTheScreen();
    expect(screen).toHavePathname('/hunts/hunt-2026-11-21');
  });

  it('leads to the SMS to check, with their number, only when there are some', async () => {
    const user = userEvent.setup();
    const reviewItem = (id: string) => ({
      id,
      from_phone: '+33639981234',
      body: 'OUI peut-être',
      received_at: '2026-11-07T07:00:00.000Z',
      reason: 'ambiguous' as const,
      member: null,
    });
    await renderScreens(
      { index: HomeScreen, messages: MessagesStub },
      {
        followUp: createInMemoryHuntFollowUp({ reviewItems: [reviewItem('s1'), reviewItem('s2')] }),
      }
    );

    await user.press(await screen.findByRole('button', { name: 'Messages à vérifier (2)' }));

    expect(await screen.findByText('Liste des messages')).toBeOnTheScreen();
    expect(screen).toHavePathname('/messages');
  });

  it('shows the link when a message to check arrives while the home screen stays open', async () => {
    jest.useFakeTimers({ now: TODAY, advanceTimers: true });
    const followUp = createInMemoryHuntFollowUp();
    await renderScreens({ index: HomeScreen }, { followUp });
    expect(await screen.findByText('Aucune battue prévue.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Messages à vérifier/ })).not.toBeOnTheScreen();

    jest.spyOn(followUp, 'listReviewItems').mockResolvedValue([
      {
        id: 's1',
        from_phone: '+33639981234',
        body: 'OUI',
        received_at: '2026-11-07T08:00:00.000Z',
        reason: 'unknown_sender',
        member: null,
      },
    ]);
    await act(() => jest.advanceTimersByTimeAsync(REVIEW_REFRESH_MS));

    expect(
      await screen.findByRole('button', { name: 'Messages à vérifier (1)' })
    ).toBeOnTheScreen();
  });

  it('shows no link to the SMS to check when there is none', async () => {
    await renderScreens({ index: HomeScreen }, { hunts: HUNTS });

    expect(await screen.findByRole('heading', { name: 'samedi 14 novembre' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Messages à vérifier/ })).not.toBeOnTheScreen();
  });

  it('opens the creation form', async () => {
    const user = userEvent.setup();
    await renderScreens({ index: HomeScreen, 'hunts/new': NewHuntStub });

    await user.press(screen.getByRole('button', { name: 'Créer une battue' }));

    expect(await screen.findByText('Formulaire de création')).toBeOnTheScreen();
    expect(screen).toHavePathname('/hunts/new');
  });

  it('opens the creation form for the day chosen in the calendar', async () => {
    const user = userEvent.setup();
    await renderScreens({ index: HomeScreen, 'hunts/new': NewHuntStub });

    await user.press(screen.getByRole('button', { name: 'vendredi 20 novembre 2026' }));
    await user.press(screen.getByRole('button', { name: 'Créer une battue' }));

    expect(await screen.findByText('Formulaire de création')).toBeOnTheScreen();
    expect(screen).toHaveSearchParams({ date: '2026-11-20' });
  });

  describe('connection to the server', () => {
    const CONNECTION_ERROR =
      'Connexion au serveur impossible. Vérifiez la connexion internet, puis réessayez.';

    it('loads the hunts once connected, and connects only once', async () => {
      const user = userEvent.setup();
      const connection: ServerConnection = { connect: jest.fn(() => Promise.resolve()) };
      await renderScreens(
        { index: HomeScreen, 'hunts/new': NewHuntScreen },
        { connection, hunts: [aHunt({ date: '2026-11-14' })] }
      );

      expect(await screen.findByRole('heading', { name: 'samedi 14 novembre' })).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Créer une battue' }));
      expect(await screen.findByText('Aucun jour choisi')).toBeOnTheScreen();

      expect(connection.connect).toHaveBeenCalledTimes(1);
    });

    it('does not load the hunts while connecting', async () => {
      const connection: ServerConnection = { connect: () => new Promise<void>(() => {}) };
      const repository: HuntRepository = { list: jest.fn(), create: jest.fn() };
      await renderScreens({ index: HomeScreen }, { connection, repository });

      expect(await screen.findByText('Connexion au serveur…')).toBeOnTheScreen();
      expect(screen.getByRole('heading', { name: 'Diane' })).toBeOnTheScreen();
      expect(repository.list).not.toHaveBeenCalled();
    });

    it('says when the server cannot be reached and lets the organizer retry', async () => {
      const user = userEvent.setup();
      const connection: ServerConnection = {
        connect: jest
          .fn<Promise<void>, []>()
          .mockRejectedValueOnce(new Error('network down'))
          .mockResolvedValue(),
      };
      await renderScreens(
        { index: HomeScreen },
        { connection, hunts: [aHunt({ date: '2026-11-14' })] }
      );

      expect(await screen.findByText(CONNECTION_ERROR)).toBeOnTheScreen();
      // Never an empty screen: the app name and the calendar stay.
      expect(screen.getByRole('heading', { name: 'Diane' })).toBeOnTheScreen();
      expect(screen.getByText('novembre 2026', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.queryByText('Aucune battue prévue.')).not.toBeOnTheScreen();
      // Creating a hunt would fail: not offered until the server answers.
      expect(screen.getByRole('button', { name: 'Créer une battue' })).toBeDisabled();

      await user.press(screen.getByRole('button', { name: 'Réessayer' }));

      expect(await screen.findByRole('heading', { name: 'samedi 14 novembre' })).toBeOnTheScreen();
      expect(screen.queryByText(CONNECTION_ERROR)).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Créer une battue' })).toBeEnabled();
    });

    it('says when the server address or the key is not configured', async () => {
      const connection: ServerConnection = {
        connect: () => Promise.reject(new ServerConfigMissingError()),
      };
      await renderScreens({ index: HomeScreen }, { connection });

      expect(await screen.findByText(CONNECTION_ERROR)).toBeOnTheScreen();
      expect(
        screen.getByText(
          "L'adresse du serveur ou la clé de l'organisateur n'est pas configurée (fichier app/.env)."
        )
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Réessayer' })).toBeOnTheScreen();
    });
  });
});
