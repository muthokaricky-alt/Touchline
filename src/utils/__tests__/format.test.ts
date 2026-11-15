import {
  describeForm,
  formatCompactCurrency,
  formatDate,
  formatGoalDifference,
  formatOrdinal,
  formatWeeklyWage,
} from '../format';
import { clamp } from '../math';

describe('formatDate', () => {
  it.each([
    ['2029-06-30', '30 Jun 2029'],
    ['2026-01-05', '5 Jan 2026'],
    ['2026-12-31', '31 Dec 2026'],
  ])('%s → %s', (iso, expected) => {
    expect(formatDate(iso)).toBe(expected);
  });

  it('returns the input unchanged if it is not an ISO date', () => {
    expect(formatDate('soon')).toBe('soon');
    expect(formatDate('2026-13-01')).toBe('2026-13-01');
  });
});

describe('formatOrdinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [111, '111th'],
  ])('%i → %s', (n, expected) => {
    expect(formatOrdinal(n)).toBe(expected);
  });
});

describe('formatGoalDifference', () => {
  it('adds a plus sign to positive values only', () => {
    expect(formatGoalDifference(5)).toBe('+5');
    expect(formatGoalDifference(0)).toBe('0');
    expect(formatGoalDifference(-3)).toBe('-3');
  });
});

describe('formatCompactCurrency', () => {
  it.each([
    [0, '€0'],
    [950, '€950'],
    [12_500, '€12.5K'],
    [45_000, '€45K'],
    [4_200_000, '€4.2M'],
    [1_000_000, '€1M'],
    [2_350_000_000, '€2.4B'],
    [-1_500_000, '-€1.5M'],
    [999_950, '€1M'],
    [999.6, '€1K'],
  ])('%i → %s', (amount, expected) => {
    expect(formatCompactCurrency(amount)).toBe(expected);
  });

  it('supports other currency symbols', () => {
    expect(formatCompactCurrency(3_000_000, '£')).toBe('£3M');
  });
});

describe('formatWeeklyWage', () => {
  it('appends a per-week suffix', () => {
    expect(formatWeeklyWage(45_000)).toBe('€45K/wk');
  });
});

describe('describeForm', () => {
  it('turns outcome letters into words for screen readers', () => {
    expect(describeForm(['W', 'D', 'L'])).toBe('won, drew, lost');
    expect(describeForm([])).toBe('');
  });
});

describe('clamp', () => {
  it('restricts values to the range', () => {
    expect(clamp(1.4, 0, 1)).toBe(1);
    expect(clamp(-2, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(Number.NaN, 0, 1)).toBe(0);
  });
});
