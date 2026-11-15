import { parseIsoDate } from '@/utils/date';

/**
 * Transfer windows. Clubs can only BUY from other clubs while a window is
 * open; free agents (no club, no fee) can be signed at any time, as in
 * real football.
 *
 *   Summer: 1 July – 31 August
 *   Winter: 1 – 31 January
 */
export type TransferWindow = { open: true; name: 'Summer' | 'Winter'; closes: string } | { open: false; opensNext: string; name: 'Summer' | 'Winter' };

export function transferWindow(date: string): TransferWindow {
  const { year, month } = parseIsoDate(date);
  if (month === 7 || month === 8) return { open: true, name: 'Summer', closes: `${year}-08-31` };
  if (month === 1) return { open: true, name: 'Winter', closes: `${year}-01-31` };
  // Closed: Feb–Jun → summer opens 1 July this year; Sep–Dec → winter opens 1 January next year.
  return month <= 6
    ? { open: false, name: 'Summer', opensNext: `${year}-07-01` }
    : { open: false, name: 'Winter', opensNext: `${year + 1}-01-01` };
}
