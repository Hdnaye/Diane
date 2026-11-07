import appJson from '../../app.json';

import { colors } from '@/theme/tokens';

// app.json cannot import the tokens: this keeps its colors in sync with them.
describe('app.json', () => {
  it('uses the primary color for the splash screen', () => {
    const splash = appJson.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
    ) as [string, { backgroundColor: string }];

    expect(splash[1].backgroundColor).toBe(colors.primary.DEFAULT);
  });

  it('uses the app background color behind the Android icon', () => {
    expect(appJson.expo.android.adaptiveIcon.backgroundColor).toBe(colors.background);
  });
});
