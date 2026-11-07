// Single source of truth for the "readable" design tokens.
// Consumed by tailwind.config.js (NativeWind classes) and by src/lib/theme.ts
// (React Navigation theme). Components must use the generated classes, never raw values.
// Sizes are in rem; NativeWind inlines 1rem = 16px (see metro.config.js).

/** High-contrast palette (WCAG AA or better for every foreground/background pair). */
const colors = {
  background: '#FFFFFF',
  foreground: '#111111',
  card: { DEFAULT: '#FFFFFF', foreground: '#111111' },
  popover: { DEFAULT: '#FFFFFF', foreground: '#111111' },
  primary: { DEFAULT: '#1F5C2E', foreground: '#FFFFFF' },
  secondary: { DEFAULT: '#E3EBE5', foreground: '#111111' },
  muted: { DEFAULT: '#F0F0F0', foreground: '#404040' },
  accent: { DEFAULT: '#E3EBE5', foreground: '#111111' },
  destructive: { DEFAULT: '#B3261E', foreground: '#FFFFFF' },
  border: '#737373',
  input: '#737373',
  ring: '#1F5C2E',
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
};

const borderRadius = {
  lg: '0.625rem',
  md: '0.5rem',
  sm: '0.375rem',
};

module.exports = { colors, fontSize, spacing, borderRadius };
