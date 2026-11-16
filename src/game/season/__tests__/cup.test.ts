import { buildFictionalDatabase } from '@/data/fictional';
import { weekdayOf } from '@/utils/date';

import { cupRoundCount, cupRoundDate, cupRoundName, drawCupRound, firstCupRound, tieWinner } from '../cup';
import type { Fixture } from '../season';
import { createSeason } from '../season-flow';

describe('cup structure', () => {
  it.each([
    [2, 1],
    [8, 3],
    [16, 4],
    [40, 6],
    [33, 6],
    [64, 6],
  ])('%i entrants → %i rounds', (entrants, rounds) => {
    expect(cupRoundCount(entrants)).toBe(rounds);
  });

  it('names rounds from the end, with a trimming first round when needed', () => {
    const names = [1, 2, 3, 4, 5, 6].map((r) => cupRoundName(r, 6, 40));
    expect(names).toEqual(['First round', 'Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']);
    expect(cupRoundName(1, 4, 16)).toBe('Round of 16');
  });

  it('plays rounds on Wednesdays in order, and the final on a Saturday after the league', () => {
    const dates = [1, 2, 3, 4, 5, 6].map((r) => cupRoundDate(2026, r, 6, 38));
    expect([...dates].sort()).toEqual(dates);
    dates.slice(0, 5).forEach((d) => expect(weekdayOf(d)).toBe(3));
    expect(weekdayOf(dates[5])).toBe(6);
    expect(dates[5] > '2027-04-24').toBe(true); // after the 38th league Saturday
  });
});

describe('drawCupRound', () => {
  const clubs = Array.from({ length: 16 }, (_, i) => `club_${i}`);
  const draw = drawCupRound({ cupId: 'comp_cup', round: 3, participants: clubs, date: '2026-12-02', startYear: 2026, seed: 5 });

  it('pairs every participant exactly once', () => {
    expect(draw).toHaveLength(8);
    expect(new Set(draw.flatMap((f) => [f.homeId, f.awayId])).size).toBe(16);
    expect(draw.every((f) => f.matchday === 3 && f.result === null)).toBe(true);
  });

  it('is seeded: same seed same draw, different seed different draw', () => {
    const again = drawCupRound({ cupId: 'comp_cup', round: 3, participants: clubs, date: '2026-12-02', startYear: 2026, seed: 5 });
    const other = drawCupRound({ cupId: 'comp_cup', round: 3, participants: clubs, date: '2026-12-02', startYear: 2026, seed: 6 });
    expect(again).toEqual(draw);
    expect(other.map((f) => f.homeId)).not.toEqual(draw.map((f) => f.homeId));
  });

  it('rejects an odd number of clubs', () => {
    expect(() => drawCupRound({ cupId: 'comp_cup', round: 1, participants: clubs.slice(0, 3), date: '2026-12-02', startYear: 2026, seed: 1 })).toThrow(RangeError);
  });
});

describe('first round with 40 entrants', () => {
  const db = buildFictionalDatabase();
  const season = createSeason(db, 2026, 11);
  const first = firstCupRound(season, 'comp_national_cup');

  it('has 8 ties, all between Second Division clubs, giving everyone else a bye', () => {
    expect(first).toHaveLength(8);
    const second = new Set(season.leagues[1].clubIds);
    first.forEach((f) => {
      expect(second.has(f.homeId)).toBe(true);
      expect(second.has(f.awayId)).toBe(true);
    });
  });

  it('is already part of a new season', () => {
    expect(season.fixtures.filter((f) => f.competitionId === 'comp_national_cup')).toHaveLength(8);
  });
});

describe('tieWinner', () => {
  const tie = (home: number, away: number, penalties?: { home: number; away: number }): Fixture => ({
    id: 'fx_cup_t', competitionId: 'comp_cup', matchday: 1, date: '2026-08-26', homeId: 'club_h', awayId: 'club_a',
    result: { score: { home, away }, goals: [], cards: [], playerOfTheMatch: null, ...(penalties ? { penalties } : {}) },
  });

  it('uses the score, or penalties when level', () => {
    expect(tieWinner(tie(2, 1))).toBe('club_h');
    expect(tieWinner(tie(0, 1))).toBe('club_a');
    expect(tieWinner(tie(1, 1, { home: 3, away: 4 }))).toBe('club_a');
    expect(tieWinner({ ...tie(0, 0), result: null })).toBeNull();
  });
});
