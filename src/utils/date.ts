/**
 * Date helpers for ISO calendar dates (`YYYY-MM-DD`).
 *
 * We work with the date parts directly instead of `new Date(...)`, because
 * JS Date parsing applies time zones and can shift a date by a day.
 */

type DateParts = { year: number; month: number; day: number };

export function parseIsoDate(iso: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`Not an ISO date (YYYY-MM-DD): "${iso}"`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Age in whole years on `onDate`. The birthday itself counts as the new age. */
export function ageOn(dateOfBirth: string, onDate: string): number {
  const birth = parseIsoDate(dateOfBirth);
  const on = parseIsoDate(onDate);
  const hadBirthdayThisYear =
    on.month > birth.month || (on.month === birth.month && on.day >= birth.day);
  return on.year - birth.year - (hadBirthdayThisYear ? 0 : 1);
}

/** Formats parts as `YYYY-MM-DD`. */
export function toIsoDate({ year, month, day }: DateParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
