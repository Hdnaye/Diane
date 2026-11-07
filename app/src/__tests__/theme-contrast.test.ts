import { contrastRatio } from '@/theme/contrast';
import { colors } from '@/theme/tokens';

// WCAG 2.x AA threshold for normal-size text.
const AA_TEXT = 4.5;

describe('contrastRatio', () => {
  it('follows the WCAG formula', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#FFFFFF', '#135E4B')).toBeCloseTo(7.69, 1);
  });

  it('does not depend on the order of the colors', () => {
    expect(contrastRatio('#10231D', '#A1D8B5')).toBeCloseTo(
      contrastRatio('#A1D8B5', '#10231D'),
      5
    );
  });
});

type Group = { DEFAULT: string; foreground: string };
const isGroup = (value: unknown): value is Group =>
  typeof value === 'object' && value !== null && 'DEFAULT' in value && 'foreground' in value;

// Every `<name>` / `<name>-foreground` pair defined by the theme.
const foregroundPairs = Object.entries(colors)
  .filter((entry): entry is [string, Group] => isGroup(entry[1]))
  .map(([name, group]) => [`${name}-foreground`, group.foreground, name, group.DEFAULT]);

// Other text/background combinations used by the components and screens.
const otherPairs = [
  ['foreground', colors.foreground, 'background', colors.background],
  ['foreground', colors.foreground, 'card', colors.card.DEFAULT],
  ['foreground', colors.foreground, 'surface', colors.surface.DEFAULT],
  ['foreground', colors.foreground, 'accent-light', colors.accent.light],
  ['primary', colors.primary.DEFAULT, 'background', colors.background],
  ['primary', colors.primary.DEFAULT, 'card', colors.card.DEFAULT],
  ['primary', colors.primary.DEFAULT, 'surface', colors.surface.DEFAULT],
  ['primary', colors.primary.DEFAULT, 'accent-light', colors.accent.light],
  ['muted-foreground', colors.muted.foreground, 'background', colors.background],
  ['muted-foreground', colors.muted.foreground, 'card', colors.card.DEFAULT],
];

describe('theme text/background pairs', () => {
  it.each([...foregroundPairs, ...otherPairs])(
    'text %s (%s) on %s (%s) reaches 4.5:1',
    (_text, text, _background, background) => {
      expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  );

  it('defines the status colors', () => {
    expect(isGroup(colors.danger)).toBe(true);
    expect(isGroup(colors.warning)).toBe(true);
    expect(isGroup(colors.surface)).toBe(true);
  });
});
