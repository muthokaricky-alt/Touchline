import { ageOn, parseIsoDate, toIsoDate } from '../date';

describe('ageOn', () => {
  it.each([
    ['2000-07-01', '2026-07-01', 26], // birthday today counts
    ['2000-07-02', '2026-07-01', 25], // birthday tomorrow
    ['2000-06-30', '2026-07-01', 26], // birthday yesterday
    ['2000-12-31', '2026-01-01', 25],
    ['2004-02-29', '2026-02-28', 21], // leap-day birthday, not yet reached
    ['2004-02-29', '2026-03-01', 22],
  ])('born %s, on %s, is %i', (dob, on, expected) => {
    expect(ageOn(dob, on)).toBe(expected);
  });
});

describe('parseIsoDate / toIsoDate', () => {
  it('round-trips a date', () => {
    expect(toIsoDate(parseIsoDate('2026-07-01'))).toBe('2026-07-01');
  });

  it('pads single-digit months and days', () => {
    expect(toIsoDate({ year: 2026, month: 3, day: 9 })).toBe('2026-03-09');
  });

  it('rejects non-ISO strings', () => {
    expect(() => parseIsoDate('01/07/2026')).toThrow(RangeError);
  });
});
