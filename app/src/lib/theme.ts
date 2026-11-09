import { DefaultTheme, type Theme } from 'expo-router';

import { colors } from '@/theme/tokens';

/**
 * Options of every screen. With Liquid Glass (iOS 26 and later), a header without background is a
 * see-through bar laid over the screen: the content would start behind it, out of reach. An opaque
 * header makes `react-native-screens` lay the content out below it; it is already so on Android.
 */
export const SCREEN_OPTIONS = { headerTransparent: false };

// Navigation chrome (headers, screen backgrounds) uses the same tokens as NativeWind.
export const NAV_THEME: Theme = {
  ...DefaultTheme,
  colors: {
    background: colors.background,
    border: colors.border,
    card: colors.card.DEFAULT,
    notification: colors.danger.DEFAULT,
    primary: colors.primary.DEFAULT,
    text: colors.foreground,
  },
};
