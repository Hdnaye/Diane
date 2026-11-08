import {
  addDaysToKey,
  formatParisDateTime,
  parisDay,
  parisToUtc,
  shiftParisDays,
  utcToParis,
} from '@/lib/paris-time';

// Paris time must not depend on the phone's time zone: tests run with the phone in New York
// (see jest.config.js).
describe('Paris time', () => {
  it('runs with the phone outside of Paris', () => {
    expect(new Date('2026-11-07T12:00:00Z').getHours()).not.toBe(13);
  });

  it('converts a Paris wall time to an instant, in winter and in summer', () => {
    expect(parisToUtc('2026-11-09', '20:00').toISOString()).toBe('2026-11-09T19:00:00.000Z');
    expect(parisToUtc('2026-07-14', '08:30').toISOString()).toBe('2026-07-14T06:30:00.000Z');
  });

  it('follows the daylight saving switches (last Sundays of March and October)', () => {
    // Summer time ends on Sunday 25 October 2026 at 3:00 (back to 2:00).
    expect(parisToUtc('2026-10-24', '20:00').toISOString()).toBe('2026-10-24T18:00:00.000Z');
    expect(parisToUtc('2026-10-25', '20:00').toISOString()).toBe('2026-10-25T19:00:00.000Z');
    // Summer time starts on Sunday 28 March 2027 at 2:00 (to 3:00).
    expect(parisToUtc('2027-03-27', '20:00').toISOString()).toBe('2027-03-27T19:00:00.000Z');
    expect(parisToUtc('2027-03-28', '20:00').toISOString()).toBe('2027-03-28T18:00:00.000Z');
  });

  it('gives the Paris day and time of an instant', () => {
    expect(utcToParis(new Date('2026-11-07T23:30:00Z'))).toEqual({
      day: '2026-11-08',
      time: '00:30',
    });
    expect(utcToParis(new Date('2026-07-14T21:59:00Z'))).toEqual({
      day: '2026-07-14',
      time: '23:59',
    });
    expect(parisDay(new Date('2026-11-07T22:59:00Z'))).toBe('2026-11-07');
  });

  it('adds days to a day key across months and years', () => {
    expect(addDaysToKey('2026-11-07', 2)).toBe('2026-11-09');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('moves an instant by whole Paris days, keeping its Paris time across a switch', () => {
    const saturdayEvening = parisToUtc('2026-10-24', '20:00');
    expect(shiftParisDays(saturdayEvening, 1)).toEqual(parisToUtc('2026-10-25', '20:00'));
    expect(shiftParisDays(saturdayEvening, -1)).toEqual(parisToUtc('2026-10-23', '20:00'));
  });

  it('writes an instant in full, in Paris time', () => {
    expect(formatParisDateTime(new Date('2026-11-09T19:00:00Z'))).toBe(
      'lundi 9 novembre à 20 h 00'
    );
    expect(formatParisDateTime(new Date('2026-07-14T06:05:00Z'))).toBe('mardi 14 juillet à 8 h 05');
  });
});
