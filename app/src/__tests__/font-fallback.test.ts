/**
 * @jest-environment node
 */
import postcss from 'postcss';
import tailwind from 'tailwindcss';
// Same compiler NativeWind's Metro transformer uses to turn the CSS into native styles.
import { cssToReactNativeRuntime } from 'react-native-css-interop/dist/css-to-rn';

import { fontFamily } from '@/theme/tokens';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwindConfig = require('../../tailwind.config.js');

async function compile(className: string) {
  const { css } = await postcss([
    tailwind({ ...tailwindConfig, content: [{ raw: className }] }),
  ]).process('@tailwind utilities;', { from: undefined });
  return { css, native: cssToReactNativeRuntime(css, { inlineRem: 16 }) };
}

describe('font families', () => {
  it.each(Object.keys(fontFamily))(
    'font-%s falls back to the system font on the web',
    async (name) => {
      const { css } = await compile(`font-${name}`);

      expect(css).toMatch(/font-family: AtkinsonHyperlegible_\w+, system-ui, sans-serif/);
    }
  );

  it.each(Object.keys(fontFamily))(
    'font-%s uses the loaded Atkinson Hyperlegible family on native',
    async (name) => {
      const { native } = await compile(`font-${name}`);

      // React Native accepts a single family: NativeWind keeps the first entry of the list.
      expect(JSON.stringify(native.rules)).toContain(
        `"fontFamily":"${fontFamily[name as keyof typeof fontFamily][0]}"`
      );
    }
  );
});
