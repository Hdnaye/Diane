import { userEvent } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import HomeScreen from '@/app/index';
import NewHuntScreen from '@/app/hunts/new';
import { freezeDate, unfreezeDate } from '@/test-utils/clock';
import { aHunt, renderScreens } from '@/test-utils/router';

// Saturday 7 November 2026, 10:00 in Paris (the tests run with the phone in New York).
const TODAY = new Date('2026-11-07T09:00:00Z');

const routes = { index: HomeScreen, 'hunts/new': NewHuntScreen };

function openForm(query = '', hunts = [aHunt({ date: '2026-11-14' })]) {
  return renderScreens(routes, { initialUrl: `/hunts/new${query}`, hunts });
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.press(screen.getByRole('button', { name: 'Créer la battue' }));
}

describe('NewHuntScreen', () => {
  beforeEach(() => freezeDate(TODAY));
  afterEach(unfreezeDate);

  it('starts with the day chosen in the calendar, 8 h 00 and a deadline two days later at 20 h 00', async () => {
    await openForm('?date=2026-11-20');

    expect(await screen.findByText('Jour choisi : vendredi 20 novembre')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'vendredi 20 novembre 2026' })).toBeSelected();
    expect(screen.getByText('8 h 00')).toBeOnTheScreen();
    expect(screen.getByText('lundi 9 novembre à 20 h 00')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nombre maximum de participants (facultatif)')).toHaveDisplayValue(
      ''
    );
  });

  it('lets the day be chosen in the calendar, but not a day that already has a hunt', async () => {
    const user = userEvent.setup();
    await openForm();

    expect(await screen.findByText('Aucun jour choisi')).toBeOnTheScreen();
    expect(
      await screen.findByRole('button', { name: 'samedi 14 novembre 2026, battue prévue' })
    ).toBeDisabled();

    await user.press(screen.getByRole('button', { name: 'jeudi 26 novembre 2026' }));

    expect(screen.getByText('Jour choisi : jeudi 26 novembre')).toBeOnTheScreen();
  });

  it('creates the hunt and shows it back on the calendar', async () => {
    const user = userEvent.setup();
    const { repository } = await renderScreens(routes);

    await user.press(screen.getByRole('button', { name: 'vendredi 20 novembre 2026' }));
    await user.press(screen.getByRole('button', { name: 'Créer une battue' }));
    expect(await screen.findByText('Jour choisi : vendredi 20 novembre')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: '− 1 h, rendez-vous une heure plus tôt' }));
    await user.press(
      screen.getByRole('button', { name: '+ 15 min, rendez-vous 15 minutes plus tard' })
    );
    expect(screen.getByText('7 h 15')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Nombre maximum de participants (facultatif)'), '15');
    await submit(user);

    expect(await screen.findByRole('heading', { name: 'vendredi 20 novembre' })).toBeOnTheScreen();
    expect(screen.getByText('Rendez-vous à 7 h 15')).toBeOnTheScreen();
    expect(screen.getByText('15 places au maximum')).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
    expect(await repository.list()).toEqual([
      expect.objectContaining({
        date: '2026-11-20',
        meeting_time: '07:15',
        max_participants: 15,
        response_deadline: '2026-11-09T19:00:00.000Z',
      }),
    ]);
  });

  it('creates a hunt without a maximum number of participants', async () => {
    const user = userEvent.setup();
    const { repository } = await openForm('?date=2026-11-20', []);

    await submit(user);

    expect(await screen.findByRole('heading', { name: 'vendredi 20 novembre' })).toBeOnTheScreen();
    expect(await repository.list()).toEqual([
      expect.objectContaining({ date: '2026-11-20', max_participants: null }),
    ]);
  });

  it('asks for a day when none is chosen', async () => {
    const user = userEvent.setup();
    await openForm();

    await submit(user);

    expect(await screen.findByText('Choisissez le jour de la battue.')).toBeOnTheScreen();
  });

  it('shows every error at once', async () => {
    const user = userEvent.setup();
    await openForm();

    await user.type(screen.getByLabelText('Nombre maximum de participants (facultatif)'), '0');
    for (let i = 0; i < 3; i++) {
      await user.press(
        screen.getByRole('button', { name: '− 1 jour, date limite un jour plus tôt' })
      );
    }
    await submit(user);

    expect(await screen.findByText('Choisissez le jour de la battue.')).toBeOnTheScreen();
    expect(
      screen.getByText('Indiquez un nombre entier, au moins 1, ou laissez vide.')
    ).toBeOnTheScreen();
    expect(screen.getByText('La date limite de réponse est déjà passée.')).toBeOnTheScreen();
  });

  it('refuses a day in the past', async () => {
    const user = userEvent.setup();
    await openForm('?date=2026-11-02');

    await submit(user);

    expect(
      await screen.findByText('La date de la battue ne peut pas être dans le passé.')
    ).toBeOnTheScreen();
  });

  it('refuses a day that already has a hunt, with a clear message', async () => {
    const user = userEvent.setup();
    const { repository } = await openForm('?date=2026-11-14');

    await submit(user);

    expect(
      await screen.findByText(
        'Il y a déjà une battue le samedi 14 novembre. Choisissez un autre jour.'
      )
    ).toBeOnTheScreen();
    expect(await repository.list()).toHaveLength(1);
  });

  it.each(['0', '2.5', 'douze'])(
    'refuses "%s" as a maximum number of participants',
    async (value) => {
      const user = userEvent.setup();
      await openForm('?date=2026-11-20');

      await user.type(screen.getByLabelText('Nombre maximum de participants (facultatif)'), value);
      await submit(user);

      expect(
        await screen.findByText('Indiquez un nombre entier, au moins 1, ou laissez vide.')
      ).toBeOnTheScreen();
    }
  );

  it('gives the default answer deadline in Paris time, even just after midnight', async () => {
    // Sunday 8 November, 00:30 in Paris (still Saturday evening in New York).
    freezeDate(new Date('2026-11-07T23:30:00Z'));
    await openForm('?date=2026-11-20');

    expect(await screen.findByText('mardi 10 novembre à 20 h 00')).toBeOnTheScreen();
  });

  it('moves the default deadline to the eve of the hunt at 20 h 00 when two days is too late', async () => {
    const user = userEvent.setup();
    // Hunt tomorrow at 8 h 00: Monday 20 h 00 would be after it.
    const { repository } = await openForm('?date=2026-11-08');

    expect(await screen.findByText('samedi 7 novembre à 20 h 00')).toBeOnTheScreen();
    await submit(user);

    expect(await screen.findByRole('heading', { name: 'dimanche 8 novembre' })).toBeOnTheScreen();
    expect(await repository.list()).toContainEqual(
      expect.objectContaining({
        date: '2026-11-08',
        response_deadline: '2026-11-07T19:00:00.000Z',
      })
    );
  });

  it('updates the default deadline when another day is chosen', async () => {
    const user = userEvent.setup();
    await openForm('?date=2026-11-20');
    expect(await screen.findByText('lundi 9 novembre à 20 h 00')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'dimanche 8 novembre 2026' }));
    expect(screen.getByText('samedi 7 novembre à 20 h 00')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'mardi 24 novembre 2026' }));
    expect(screen.getByText('lundi 9 novembre à 20 h 00')).toBeOnTheScreen();
  });

  it('requires the answer deadline to be before the hunt and lets it be changed', async () => {
    const user = userEvent.setup();
    const { repository } = await openForm('?date=2026-11-08');
    expect(await screen.findByText('samedi 7 novembre à 20 h 00')).toBeOnTheScreen();

    await user.press(
      screen.getByRole('button', { name: '+ 1 jour, date limite un jour plus tard' })
    );
    await submit(user);
    expect(
      await screen.findByText('La date limite de réponse doit être avant la battue.')
    ).toBeOnTheScreen();

    for (let i = 0; i < 13; i++) {
      await user.press(
        screen.getByRole('button', { name: '− 1 h, date limite une heure plus tôt' })
      );
    }
    expect(screen.getByText('dimanche 8 novembre à 7 h 00')).toBeOnTheScreen();
    // A deadline changed by hand is kept when the meeting time changes.
    await user.press(
      screen.getByRole('button', { name: '+ 1 h, rendez-vous une heure plus tard' })
    );
    expect(screen.getByText('dimanche 8 novembre à 7 h 00')).toBeOnTheScreen();
    await submit(user);

    expect(await screen.findByRole('heading', { name: 'dimanche 8 novembre' })).toBeOnTheScreen();
    expect(await repository.list()).toContainEqual(
      expect.objectContaining({
        date: '2026-11-08',
        response_deadline: '2026-11-08T06:00:00.000Z',
      })
    );
  });

  it('refuses an answer deadline already passed', async () => {
    const user = userEvent.setup();
    await openForm('?date=2026-11-20');

    for (let i = 0; i < 3; i++) {
      await user.press(
        screen.getByRole('button', { name: '− 1 jour, date limite un jour plus tôt' })
      );
    }
    await submit(user);

    expect(await screen.findByText('La date limite de réponse est déjà passée.')).toBeOnTheScreen();
  });
});
