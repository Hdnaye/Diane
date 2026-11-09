import { useFonts } from 'expo-font';
import { renderRouter, screen } from 'expo-router/testing-library';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

// iOS 26 and later: unless told otherwise, the native header is a see-through bar over the screen.
jest.mock('expo-glass-effect', () => ({
  ...jest.requireActual('expo-glass-effect'),
  isLiquidGlassAvailable: () => true,
}));

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, useSafeAreaInsets: jest.fn(actual.useSafeAreaInsets) };
});

const mockedUseFonts = jest.mocked(useFonts);

type Rendered = { type: string; props: Record<string, unknown>; children: unknown[] | null };

/** The first native component of this type in what was rendered. */
function findNative(node: unknown, type: string): Rendered | undefined {
  if (Array.isArray(node)) {
    return node.map((child) => findNative(child, type)).find(Boolean);
  }
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  const rendered = node as Rendered;
  return rendered.type === type ? rendered : findNative(rendered.children, type);
}

describe('RootLayout', () => {
  it('lays the screens out under an opaque header, even with Liquid Glass on iOS', async () => {
    mockedUseFonts.mockReturnValue([true, null]);

    await renderRouter(
      { _layout: RootLayout, index: HomeScreen, other: () => <Text>Autre écran</Text> },
      { initialUrl: '/other' }
    );

    expect(await screen.findByText('Autre écran')).toBeOnTheScreen();
    const header = findNative(screen.toJSON(), 'RNSScreenStackHeaderConfig');
    expect(header?.props.hidden).toBe(false);
    expect(header?.props.translucent).toBe(false);
  });

  it('keeps every screen above the bottom bar of the system', async () => {
    mockedUseFonts.mockReturnValue([true, null]);
    jest.mocked(useSafeAreaInsets).mockReturnValueOnce({ top: 59, bottom: 34, left: 0, right: 0 });

    await renderRouter({ _layout: RootLayout, index: HomeScreen });

    expect(await screen.findByTestId('screens')).toHaveStyle({ paddingBottom: 34 });
  });

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
