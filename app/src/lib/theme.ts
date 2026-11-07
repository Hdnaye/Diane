import { DefaultTheme, type Theme } from 'expo-router';

import { colors } from '@/theme/tokens';

// Navigation chrome (headers, screen backgrounds) uses the same tokens as NativeWind.
export const NAV_THEME: Theme = {
  ...DefaultTheme,
  colors: {
    background: colors.background,
    border: colors.border,
    card: colors.card.DEFAULT,
    notification: colors.destructive.DEFAULT,
    primary: colors.primary.DEFAULT,
    text: colors.foreground,
  },
};
