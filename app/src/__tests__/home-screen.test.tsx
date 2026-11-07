import { userEvent } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import HomeScreen from '@/app/index';
import { freezeDate, unfreezeDate } from '@/test-utils/clock';
import { aHunt, renderScreens } from '@/test-utils/router';

// Saturday 7 November 2026, 10:00.
const TODAY = new Date(2026, 10, 7, 10, 0);

const HUNTS = [
  aHunt({ date: '2026-10-31' }),
  aHunt({ date: '2026-11-21', meetingTime: '07:30' }),
  aHunt({ date: '2026-11-14', meetingTime: '08:00', maxParticipants: 12 }),
];

function NewHuntStub() {
  return <Text>Formulaire de création</Text>;
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

  it('marks the hunt days in the calendar', async () => {
    await renderScreens({ index: HomeScreen }, { hunts: HUNTS });

    expect(
      await screen.findByRole('button', { name: 'samedi 14 novembre 2026, battue prévue' })
    ).toBeDisabled();
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
});
