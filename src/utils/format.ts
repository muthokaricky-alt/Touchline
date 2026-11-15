import type { MatchOutcome } from '@/types/football';

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function formatOrdinal(n: number): string {
  const lastTwo = Math.abs(n) % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (Math.abs(n) % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Goal difference with an explicit sign: 5 → "+5", 0 → "0", -3 → "-3". */
export function formatGoalDifference(gd: number): string {
  return gd > 0 ? `+${gd}` : `${gd}`;
}

/**
 * Compact money for football finances: 950 → "€950", 12_500 → "€12.5K",
 * 4_200_000 → "€4.2M", -1_500_000 → "-€1.5M".
 * Money is stored as whole currency units (integers) to avoid float drift.
 */
export function formatCompactCurrency(amount: number, symbol = '€'): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const units: [number, string][] = [
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1_000, 'K'],
  ];
  // Smallest unit first, so a value that rounds up to 1000 of one unit
  // (e.g. 999_950 → "1000K") is promoted to the next unit ("1M").
  let result = `${sign}${symbol}${Math.round(abs)}`;
  if (Math.round(abs) < 1_000) return result;
  for (const [size, suffix] of [...units].reverse()) {
    const scaled = Math.round((abs / size) * 10) / 10;
    if (scaled >= 1) result = `${sign}${symbol}${trimTrailingZero(scaled)}${suffix}`;
    if (scaled < 1_000) break;
  }
  return result;
}

/** Weekly wage label: 45_000 → "€45K/wk". */
export function formatWeeklyWage(amount: number, symbol = '€'): string {
  return `${formatCompactCurrency(amount, symbol)}/wk`;
}

/** Screen-reader friendly form description: ['W','D'] → "won, drew". */
export function describeForm(results: readonly MatchOutcome[]): string {
  const words: Record<MatchOutcome, string> = { W: 'won', D: 'drew', L: 'lost' };
  return results.map((r) => words[r]).join(', ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** ISO date → "30 Jun 2029". Parsed by hand so time zones can't shift the day. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : iso;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** ISO date → "Sat 21 Nov" (with `withYear`: "Sat 21 Nov 2026"). Weekday computed in UTC. */
export function formatMatchDate(iso: string, withYear = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const label = `${weekday} ${day} ${MONTHS[month - 1]}`;
  return withYear ? `${label} ${year}` : label;
}

function trimTrailingZero(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}
