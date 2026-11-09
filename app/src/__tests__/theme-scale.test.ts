import { fontSize, spacing } from '@/theme/tokens';
import { remToPx } from '@/theme/units';

// The theme stays readable on a phone without taking the whole screen.
describe('theme scale', () => {
  it('keeps the body text comfortable, without oversizing it', () => {
    const body = remToPx(fontSize.base[0]);

    expect(body).toBeGreaterThanOrEqual(16);
    expect(body).toBeLessThanOrEqual(18);
  });

  it('keeps every touch target at 44 pt at least, without oversizing the buttons', () => {
    for (const token of ['touch-min', 'touch', 'touch-lg'] as const) {
      expect(remToPx(spacing[token])).toBeGreaterThanOrEqual(44);
    }
    expect(remToPx(spacing['touch-lg'])).toBeLessThanOrEqual(56);
  });

  it('gives every text size a line height that holds it', () => {
    for (const [size, lineHeight] of Object.values(fontSize)) {
      expect(remToPx(lineHeight)).toBeGreaterThan(remToPx(size));
    }
  });
});
