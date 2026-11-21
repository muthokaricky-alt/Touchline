import { buildFictionalDatabase } from '@/data/fictional';
import { addMessages } from '@/game/inbox/inbox';
import type { Season } from '@/game/season/season';
import { createSeason, playRemaining } from '@/game/season/season-flow';

import {
  BOARD_SHARE,
  CONTINENTAL_UNDERDOG_MULTIPLIER,
  BUDGET_CAP_MULTIPLE,
  financeMessage,
  LEAGUE_PRIZE_WINNER,
  positionShare,
  seasonFinances,
  wealthFactor,
  type SeasonFinances,
} from '../season-finances';

describe('prize scale', () => {
  it('pays the champion 100% and last place 5%, in a straight line', () => {
    expect(positionShare(1, 18)).toBe(1);
    expect(positionShare(18, 18)).toBeCloseTo(0.05);
    expect(positionShare(9, 18)).toBeGreaterThan(positionShare(10, 18));
  });

  it('keeps Kenya as the baseline and richer countries a little higher', () => {
    expect(wealthFactor('KEN')).toBeCloseTo(1);
    expect(wealthFactor('ENG')).toBeGreaterThan(wealthFactor('FRA'));
    expect(wealthFactor('FRA')).toBeGreaterThan(1);
    expect(wealthFactor('ENG')).toBeLessThan(3);
    expect(wealthFactor('XXX')).toBe(1);
  });
});

describe('end-of-season money', () => {
  const db = buildFictionalDatabase();
  const kenya = db.clubs.filter((c) => c.country === 'KEN');
  let season: Season;
  let result: SeasonFinances;

  // Plays a whole season of the full world (England and the leagues abroad), which takes a while.
  beforeAll(() => {
    season = playRemaining(db, createSeason(db, 2026, 77)).season;
    result = seasonFinances(db, season);
  }, 180_000);

  it('pays every league club and nobody else', () => {
    const inLeagues = new Set(season.leagues.flatMap((l) => l.clubIds));
    expect(result.lines.size).toBe(inLeagues.size);
    for (const id of result.lines.keys()) expect(inLeagues.has(id)).toBe(true);
  });

  it('pays the Kenyan champion the full prize and pays winning more than mid-table', () => {
    const lines = kenya.map((c) => result.lines.get(c.id)!);
    const champion = lines.find((l) => l.position === 1)!;
    const mid = lines.find((l) => l.position === 9)!;
    expect(champion.leaguePrize).toBe(LEAGUE_PRIZE_WINNER);
    expect(champion.leaguePrize).toBeGreaterThan(mid.leaguePrize);
    expect(champion.total).toBeGreaterThan(0);
  });

  it('pays Continental Cup money, and more per result to clubs outside the big four leagues', () => {
    const lines = [...result.lines.entries()];
    const country = (id: string) => db.clubs.find((c) => c.id === id)!.country;
    const entrants = lines.filter(([, l]) => l.continentalResult);
    expect(entrants.length).toBeGreaterThan(0);
    for (const [, l] of entrants) expect(l.continentalPrize).toBeGreaterThan(0);
    const winner = entrants.find(([, l]) => l.continentalResult === 'Winners');
    expect(winner).toBeDefined();
    const groupExit = entrants.filter(([, l]) => l.continentalResult === 'Group stage');
    expect(winner![1].continentalPrize).toBeGreaterThan(Math.max(...groupExit.map(([, l]) => l.continentalPrize)));
    // Same finish, bigger prize for the less prestigious leagues.
    const big = ['ENG', 'ESP', 'GER', 'ITA'];
    const small = groupExit.filter(([id]) => !big.includes(country(id)));
    const large = groupExit.filter(([id]) => big.includes(country(id)));
    if (small.length && large.length) {
      expect(Math.max(...small.map(([, l]) => l.continentalPrize))).toBeGreaterThan(Math.min(...large.map(([, l]) => l.continentalPrize)));
    }
    expect(CONTINENTAL_UNDERDOG_MULTIPLIER).toBeGreaterThan(1);
  });

  it('adds the board share of the earnings to the balance and the transfer budget', () => {
    for (const club of kenya) {
      const line = result.lines.get(club.id)!;
      const after = result.db.clubs.find((c) => c.id === club.id)!;
      expect(line.toBudget).toBe(Math.round(line.total * BOARD_SHARE));
      expect(after.finances.balance).toBe(club.finances.balance + line.toBudget);
      expect(after.finances.transferBudget).toBeGreaterThanOrEqual(club.finances.transferBudget);
      expect(after.finances.transferBudget).toBeLessThanOrEqual(club.finances.transferBudget * BUDGET_CAP_MULTIPLE);
    }
  });

  it('leaves everything but club finances untouched, and keeps money whole numbers', () => {
    expect(result.db.players).toBe(db.players);
    expect(result.db.contracts).toBe(db.contracts);
    for (const c of result.db.clubs) {
      expect(Number.isInteger(c.finances.balance)).toBe(true);
      expect(Number.isInteger(c.finances.transferBudget)).toBe(true);
      expect({ ...c, finances: 0 }).toEqual({ ...db.clubs.find((o) => o.id === c.id)!, finances: 0 });
    }
  });

  it('never grows a budget past 20× its starting size over many seasons', () => {
    let current = db;
    for (let i = 0; i < 12; i++) current = seasonFinances(current, season).db;
    for (const c of current.clubs.filter((x) => x.country === 'KEN')) {
      const start = db.clubs.find((o) => o.id === c.id)!.finances.transferBudget;
      expect(c.finances.transferBudget).toBeLessThanOrEqual(start * BUDGET_CAP_MULTIPLE);
    }
  });

  it('writes the chairman a message with the breakdown', () => {
    const club = kenya[0];
    const msg = financeMessage(result.lines.get(club.id), season.label, '2027-06-30')!;
    expect(msg.from).toBe('Chairman');
    expect(msg.title).toContain(season.label);
    expect(msg.body).toContain('Sponsorship');
    expect(addMessages([], [msg])).toHaveLength(1);
    expect(financeMessage(undefined, season.label, '2027-06-30')).toBeNull();
  });
});
