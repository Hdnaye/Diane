import { fontAssets } from '@/theme/fonts';
import { fontFamily } from '@/theme/tokens';

describe('fontAssets', () => {
  it('loads a font file for every family used by the theme', () => {
    const families = Object.values(fontFamily).map(([family]) => family);

    expect(Object.keys(fontAssets).sort()).toEqual(families.sort());
    for (const family of families) {
      expect(fontAssets[family]).toBeDefined();
    }
  });
});
