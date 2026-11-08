import { useFonts } from 'expo-font';
import { renderRouter, screen } from 'expo-router/testing-library';
import * as SplashScreen from 'expo-splash-screen';

import RootLayout from '@/app/_layout';
import HomeScreen from '@/app/index';

jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), useFonts: jest.fn() }));
// No request to a real server, even if app/.env is filled in on this machine.
jest.mock('@/data/app-backend', () => {
  const { createInMemoryHuntRepository } = jest.requireActual('@/data/hunt-repository');
  const { alwaysConnected } = jest.requireActual('@/data/server-connection');
  return {
    appBackend: { repository: createInMemoryHuntRepository(), connection: alwaysConnected },
  };
});
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

const mockedUseFonts = jest.mocked(useFonts);

describe('RootLayout', () => {
  beforeEach(() => {
    jest.mocked(SplashScreen.hideAsync).mockClear();
  });

  it('keeps the splash screen until the font is loaded', async () => {
    mockedUseFonts.mockReturnValue([false, null]);

    await renderRouter({ _layout: RootLayout, index: HomeScreen });

    expect(screen.queryByText('Diane')).not.toBeOnTheScreen();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it('shows the app once the font is loaded', async () => {
    mockedUseFonts.mockReturnValue([true, null]);

    await renderRouter({ _layout: RootLayout, index: HomeScreen });

    expect(await screen.findByText('Diane')).toBeOnTheScreen();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it('still shows the app if the font fails to load', async () => {
    mockedUseFonts.mockReturnValue([false, new Error('font unavailable')]);

    await renderRouter({ _layout: RootLayout, index: HomeScreen });

    expect(await screen.findByText('Diane')).toBeOnTheScreen();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });
});
