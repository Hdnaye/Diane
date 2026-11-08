import {
  addDaysToKey,
  formatParisDateTime,
  parisDay,
  parisToUtc,
  shiftParisDays,
  utcToParis,
} from '@/lib/paris-time';

// The phone may be anywhere: Paris time must not depend on its time zone.
const PHONE_TIME_ZONES = ['Europe/Paris', 'UTC', 'America/New_York', 'Pacific/Auckland'];

describe.each(PHONE_TIME_ZONES)('Paris time, phone in %s', (timeZone) => {
  const initialTimeZone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = timeZone;
  });
  afterAll(() => {
    process.env.TZ = initialTimeZone;
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
