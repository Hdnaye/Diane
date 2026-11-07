// NativeWind inlines 1rem = 16px (metro.config.js); libraries styled with numbers need pixels.
export const REM_IN_PX = 16;

/** "1.25rem" → 20 */
export function remToPx(rem: string): number {
  return parseFloat(rem) * REM_IN_PX;
}
