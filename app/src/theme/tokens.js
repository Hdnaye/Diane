// Single source of truth for the design tokens ("nature" visual identity, readable theme).
// Consumed by tailwind.config.js (NativeWind classes), src/lib/theme.ts (React Navigation
// theme), src/theme/fonts.ts (font loading) and app.json (splash / Android icon colors, kept
// in sync by a test). Components must use the generated classes, never raw values.
// Sizes are in rem; NativeWind inlines 1rem = 16px (see metro.config.js).

/** Raw palette. Do not use directly in components: use the semantic `colors` below. */
const palette = {
  pine: '#135E4B', // brand green: primary buttons, headers, links, titles
  leaf: '#4CB572', // bright green: "present" status, icons. Never with white text.
  leafLight: '#A1D8B5', // selected backgrounds, "present" badges, hunt days
  sage: '#CCDCDB', // secondary surfaces, borders, disabled, "no answer"
  ink: '#10231D', // main text
  mist: '#F7FAF9', // app background
  white: '#FFFFFF',
  black: '#000000', // only for faint shadows (shadow-black/5)
  slate: '#3F5A53', // secondary text
  slateLight: '#6B8780', // form field borders (3.9:1 on white, WCAG non-text contrast)
  red: '#B3261E', // "absent", cancellation
  amber: '#8A5300', // waiting list
};

/**
 * Semantic colors. Every `foreground` must reach WCAG AA (4.5:1) on its `DEFAULT`; this and
 * the other text/background pairs are checked by src/__tests__/theme-contrast.test.ts.
 * Ratios: white on primary 7.7, ink on accent 6.4, primary / ink on accent-light 4.8 / 10.2,
 * primary / ink on surface 5.4 / 11.6, white on danger 6.5, white on warning 6.3.
 */
const danger = { DEFAULT: palette.red, foreground: palette.white };

const colors = {
  transparent: 'transparent',
  current: 'currentColor',
  black: palette.black,
  white: palette.white,
  background: palette.mist,
  foreground: palette.ink,
  card: { DEFAULT: palette.white, foreground: palette.ink },
  popover: { DEFAULT: palette.white, foreground: palette.ink },
  primary: { DEFAULT: palette.pine, foreground: palette.white },
  secondary: { DEFAULT: palette.sage, foreground: palette.pine },
  surface: { DEFAULT: palette.sage, foreground: palette.ink },
  muted: { DEFAULT: palette.sage, foreground: palette.slate },
  accent: { DEFAULT: palette.leaf, foreground: palette.ink, light: palette.leafLight },
  danger,
  // Alias kept for components copied from react-native-reusables.
  destructive: danger,
  warning: { DEFAULT: palette.amber, foreground: palette.white },
  border: palette.sage,
  input: palette.slateLight,
  ring: palette.pine,
};

/**
 * Atkinson Hyperlegible, loaded at startup (src/app/_layout.tsx), then system fallbacks for the
 * web while the font downloads. Format: [family, ...fallbacks]. NativeWind keeps only the first
 * entry on native (React Native accepts a single family), which is the loaded font.
 */
const fallbackFonts = ['system-ui', 'sans-serif'];
const fontFamily = {
  sans: ['AtkinsonHyperlegible_400Regular', ...fallbackFonts],
  'sans-bold': ['AtkinsonHyperlegible_700Bold', ...fallbackFonts],
};

/** Generous type scale: body text ("base") is 20px. Format: [fontSize, lineHeight]. */
const fontSize = {
  xs: ['1rem', '1.5rem'],
  sm: ['1.125rem', '1.625rem'],
  base: ['1.25rem', '1.75rem'],
  lg: ['1.375rem', '1.875rem'],
  xl: ['1.5rem', '2rem'],
  '2xl': ['1.75rem', '2.25rem'],
  '3xl': ['2.125rem', '2.5rem'],
  '4xl': ['2.5rem', '3rem'],
};

/**
 * Touch targets: "touch" (56px) for primary actions, "touch-lg" (64px) for prominent ones,
 * "touch-min" (48px) as the floor.
 */
const spacing = {
  'touch-lg': '4rem',
  touch: '3.5rem',
  'touch-min': '3rem',
  // Space above / below the calendar's day names (react-native-calendars' own 2px / 7px).
  'day-name-top': '0.125rem',
  'day-name-bottom': '0.4375rem',
};

/** Rounded, soft shapes: cards use "xl", buttons "lg", badges "full". */
const borderRadius = {
  xl: '1rem',
  lg: '0.75rem',
  md: '0.5rem',
  sm: '0.375rem',
};

module.exports = { colors, fontFamily, fontSize, spacing, borderRadius };
