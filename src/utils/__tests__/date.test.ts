import { addDays, ageOn, daysBetween, nextWeekday, parseIsoDate, toIsoDate, weekdayOf } from '../date';

describe('calendar arithmetic', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-08-29', 7)).toBe('2026-09-05');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2028-02-27', 2)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('knows weekdays', () => {
    expect(weekdayOf('2026-11-14')).toBe(6); // Saturday
    expect(weekdayOf('2026-07-01')).toBe(3); // Wednesday
  });

  it('finds the next given weekday, including the same day', () => {
    expect(nextWeekday('2026-08-08', 6)).toBe('2026-08-08');
    expect(nextWeekday('2026-08-03', 6)).toBe('2026-08-08');
  });
});

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

describe('daysBetween', () => {
  it('counts whole days across months, years and leap days', () => {
    expect(daysBetween('2026-08-08', '2026-08-15')).toBe(7);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-08-15', '2026-08-08')).toBe(-7);
  });
});
