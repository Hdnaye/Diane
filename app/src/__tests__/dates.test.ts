import {
  formatLongDay,
  formatTime,
  fromDateKey,
  shiftTime,
  toDateKey,
} from '@/lib/dates';

describe('date helpers', () => {
  it('writes a day in full, in French, without the year', () => {
    expect(formatLongDay('2026-11-14')).toBe('samedi 14 novembre');
    expect(formatLongDay('2027-01-01')).toBe('vendredi 1 janvier');
  });

  it('writes a meeting time the French way', () => {
    expect(formatTime('08:00')).toBe('8 h 00');
    expect(formatTime('07:30')).toBe('7 h 30');
    expect(formatTime('13:05')).toBe('13 h 05');
  });

  it('converts between local dates and day keys', () => {
    expect(toDateKey(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-07');
    expect(fromDateKey('2026-11-14')).toEqual(new Date(2026, 10, 14));
  });

  it('shifts a time, carrying hours and wrapping around midnight', () => {
    expect(shiftTime('07:45', 15)).toBe('08:00');
    expect(shiftTime('08:00', -15)).toBe('07:45');
    expect(shiftTime('23:00', 60)).toBe('00:00');
    expect(shiftTime('00:00', -60)).toBe('23:00');
  });
});
