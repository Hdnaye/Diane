import '../../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { appHuntRepository } from '@/data/app-hunt-repository';
import { HuntRepositoryProvider } from '@/data/hunt-repository-context';
import { queryClient } from '@/lib/query-client';
import { NAV_THEME } from '@/lib/theme';
import { fontAssets } from '@/theme/fonts';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

// Keep the splash screen until the font is ready, so no text renders in the system font.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  // If the font cannot be loaded, show the app anyway in the system font.
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <HuntRepositoryProvider repository={appHuntRepository}>
        <ThemeProvider value={NAV_THEME}>
          <StatusBar style="dark" />
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
          </Stack>
          <PortalHost />
        </ThemeProvider>
      </HuntRepositoryProvider>
    </QueryClientProvider>
  );
}
