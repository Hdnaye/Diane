import { defaultResponseDeadline } from '@/lib/hunt-form';

// Instants are written in UTC: the rule is in Paris time, whatever the phone's time zone
// (the tests run with the phone in New York, see jest.config.js).
const at = (iso: string) => new Date(iso);
const deadline = (now: string, date?: string, meetingTime?: string) =>
  defaultResponseDeadline(at(now), date, meetingTime).toISOString();

describe('default answer deadline', () => {
  it('is two days after today at 20 h 00, Paris time', () => {
    // Saturday 7 November 2026, 10:09 in Paris → Monday 9 November, 20 h 00.
    expect(deadline('2026-11-07T09:09:00Z')).toBe('2026-11-09T19:00:00.000Z');
    expect(deadline('2026-11-07T09:09:00Z', '2026-11-20', '08:00')).toBe(
      '2026-11-09T19:00:00.000Z'
    );
  });

  it('counts days from today in Paris, even just after midnight', () => {
    // 00:30 in Paris on Sunday 8 November (still Saturday in UTC and in New York).
    expect(deadline('2026-11-07T23:30:00Z')).toBe('2026-11-10T19:00:00.000Z');
    // 23:30 in Paris on Saturday 7 November.
    expect(deadline('2026-11-07T22:30:00Z')).toBe('2026-11-09T19:00:00.000Z');
  });

  it('is at 20 h 00 Paris time across the daylight saving switches', () => {
    // Friday 23 October 2026 (summer time) → Sunday 25 October, winter time from 3:00.
    expect(deadline('2026-10-23T08:00:00Z')).toBe('2026-10-25T19:00:00.000Z');
    // Friday 26 March 2027 (winter time) → Sunday 28 March, summer time from 2:00.
    expect(deadline('2027-03-26T09:00:00Z')).toBe('2027-03-28T18:00:00.000Z');
  });

  it('is the eve of the hunt at 20 h 00 when two days is not strictly before the hunt', () => {
    // Hunt on Monday 9 November at 8 h 00: the eve, Sunday 8 November at 20 h 00.
    expect(deadline('2026-11-07T09:00:00Z', '2026-11-09', '08:00')).toBe(
      '2026-11-08T19:00:00.000Z'
    );
    // Hunt on Monday 9 November at 20 h 00 exactly: not strictly before either.
    expect(deadline('2026-11-07T09:00:00Z', '2026-11-09', '20:00')).toBe(
      '2026-11-08T19:00:00.000Z'
    );
    // Hunt on Monday 9 November at 20 h 15: two days at 20 h 00 is before it.
    expect(deadline('2026-11-07T09:00:00Z', '2026-11-09', '20:15')).toBe(
      '2026-11-09T19:00:00.000Z'
    );
  });

  it('keeps the eve of the hunt across a daylight saving switch', () => {
    // Hunt on Monday 26 October 2026; the eve, Sunday 25, is in winter time.
    expect(deadline('2026-10-24T08:00:00Z', '2026-10-26', '08:00')).toBe(
      '2026-10-25T19:00:00.000Z'
    );
  });

  it('gives the eve of the hunt even if already passed: the form then shows the error', () => {
    // Saturday 7 November, 21:00 in Paris; hunt tomorrow: the eve at 20 h 00 is passed.
    expect(deadline('2026-11-07T20:00:00Z', '2026-11-08', '08:00')).toBe(
      '2026-11-07T19:00:00.000Z'
    );
  });
});
