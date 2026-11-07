// Per-weight imports: the package index would also bundle the unused italic files.
import { AtkinsonHyperlegible_400Regular } from '@expo-google-fonts/atkinson-hyperlegible/400Regular';
import { AtkinsonHyperlegible_700Bold } from '@expo-google-fonts/atkinson-hyperlegible/700Bold';

import { fontFamily } from '@/theme/tokens';

// Font files for every family declared in the tokens (`font-sans`, `font-sans-bold`).
// Each weight is its own family: React Native cannot pick a face from `fontWeight` on Android.
export const fontAssets: Record<string, number> = {
  [fontFamily.sans[0]]: AtkinsonHyperlegible_400Regular,
  [fontFamily['sans-bold'][0]]: AtkinsonHyperlegible_700Bold,
};
