import { userEvent } from '@testing-library/react-native';
import { useFonts } from 'expo-font';
import { renderRouter, screen } from 'expo-router/testing-library';

import RootLayout from '@/app/_layout';
import HomeScreen from '@/app/index';
import MembersScreen from '@/app/members/index';

jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), useFonts: jest.fn() }));
// The app's data, in memory: no request to a real server, even if app/.env is filled in.
jest.mock('@/data/app-backend', () => {
  const { createInMemoryHuntRepository } = jest.requireActual('@/data/hunt-repository');
  const { createInMemoryMemberRepository } = jest.requireActual('@/data/member-repository');
  const { alwaysConnected } = jest.requireActual('@/data/server-connection');
  return {
    appBackend: {
      repository: createInMemoryHuntRepository(),
      members: createInMemoryMemberRepository([
        { id: 'm1', name: 'Jean Exemple', phone: '+33639980001', email: '', active: true },
      ]),
      connection: alwaysConnected,
    },
  };
});
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

describe('members in the app', () => {
  it('are reached from the home screen and read from the app back-end', async () => {
    jest.mocked(useFonts).mockReturnValue([true, null]);
    const user = userEvent.setup();
    await renderRouter({ _layout: RootLayout, index: HomeScreen, 'members/index': MembersScreen });

    await user.press(await screen.findByRole('button', { name: 'Adhérents' }));

    expect(await screen.findByRole('heading', { name: 'Jean Exemple' })).toBeOnTheScreen();
    expect(screen).toHavePathname('/members');
  });
});
