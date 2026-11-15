import { contractFactor, contractYearsLeft, marketValue, roundFee, wageDemand } from '../valuation';
import { transferWindow } from '../window';

describe('marketValue', () => {
  it('hits the calibration targets', () => {
    const star = marketValue({ ability: 16, age: 25, yearsLeft: 4 });
    expect(star).toBeGreaterThanOrEqual(25_000_000);
    expect(star).toBeLessThanOrEqual(35_000_000);
    const veteran = marketValue({ ability: 10, age: 31, yearsLeft: 2 });
    expect(veteran).toBeGreaterThanOrEqual(300_000);
    expect(veteran).toBeLessThanOrEqual(600_000);
  });

  it('rises with ability, falls with age past 28 and with a shorter contract', () => {
    for (let ability = 4; ability < 19; ability++) {
      expect(marketValue({ ability: ability + 1, age: 25, yearsLeft: 3 })).toBeGreaterThan(marketValue({ ability, age: 25, yearsLeft: 3 }));
    }
    // Up to 37: beyond that values approach the €25K minimum fee, where they must level off.
    for (let age = 28; age < 37; age++) {
      expect(marketValue({ ability: 14, age: age + 1, yearsLeft: 3 })).toBeLessThan(marketValue({ ability: 14, age, yearsLeft: 3 }));
    }
    const years = [0.5, 1, 2, 3].map((yearsLeft) => marketValue({ ability: 14, age: 25, yearsLeft }));
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it('values without a contract at full value (used for free-agent comparisons)', () => {
    expect(marketValue({ ability: 12, age: 25, yearsLeft: null })).toBe(marketValue({ ability: 12, age: 25, yearsLeft: 5 }));
    expect(contractFactor(0)).toBeLessThan(contractFactor(1));
  });
});

describe('roundFee', () => {
  it.each([
    [1_234_567, 1_200_000],
    [987_654, 990_000],
    [31_450_000, 31_000_000],
    [12_000, 25_000],
    [0, 0],
  ])('%i → %i', (input, expected) => {
    expect(roundFee(input)).toBe(expected);
  });
});

describe('wageDemand', () => {
  it('matches the squad generator and asks for a rise when moving', () => {
    // 45·12² + 250·10 = 8,980, rounded to the nearest €100.
    expect(wageDemand({ ability: 12, clubReputation: 10, currentWage: null })).toBe(9000);
    expect(wageDemand({ ability: 12, clubReputation: 10, currentWage: 20_000 })).toBe(22_000);
    expect(wageDemand({ ability: 16, clubReputation: 15, currentWage: null })).toBeGreaterThan(wageDemand({ ability: 10, clubReputation: 15, currentWage: null }));
  });
});

describe('contractYearsLeft', () => {
  it('counts years and months until the end date', () => {
    expect(contractYearsLeft({ endDate: '2029-06-30' }, '2026-07-01')).toBeCloseTo(3, 1);
    expect(contractYearsLeft({ endDate: '2027-06-30' }, '2027-01-01')).toBeCloseTo(0.5, 1);
    expect(contractYearsLeft({ endDate: '2026-06-30' }, '2026-07-01')).toBe(0);
  });
});

describe('transferWindow', () => {
  it.each([
    ['2026-07-01', true, 'Summer'],
    ['2026-08-31', true, 'Summer'],
    ['2027-01-15', true, 'Winter'],
  ] as const)('%s is open (%s)', (date, open, name) => {
    expect(transferWindow(date)).toMatchObject({ open, name });
  });

  it('says when it opens next', () => {
    expect(transferWindow('2026-09-01')).toEqual({ open: false, name: 'Winter', opensNext: '2027-01-01' });
    expect(transferWindow('2027-03-10')).toEqual({ open: false, name: 'Summer', opensNext: '2027-07-01' });
  });
});
