import type { League } from '@/data/schemas';

import { seasonPlayerStats, topAssists, topScorers } from '../player-stats';
import type { Fixture, FixtureResult } from '../season';
import { computeTable, zoneFor } from '../table';

const league: League = {
  id: 'comp_test',
  type: 'league',
  name: 'Test League',
  shortName: 'Test',
  country: 'ENG',
  tier: 1,
  clubIds: ['club_a', 'club_b', 'club_c', 'club_d'],
  rules: { roundsPerOpponent: 2, points: { win: 3, draw: 1, loss: 0 }, promotionPlaces: 0, relegationPlaces: 1 },
};

let nextId = 0;
function result(home: number, away: number, extras: Partial<FixtureResult> = {}): FixtureResult {
  return { score: { home, away }, goals: [], cards: [], players: [], playerOfTheMatch: null, ...extras };
}
function fx(homeId: string, awayId: string, home: number | null, away = 0, matchday = 1, extras: Partial<FixtureResult> = {}): Fixture {
  return {
    id: `fx_t_${nextId++}`,
    competitionId: 'comp_test',
    matchday,
    date: '2026-08-08',
    homeId,
    awayId,
    result: home === null ? null : result(home, away, extras),
  };
}

describe('computeTable', () => {
  it('lists every club with zeros before any match', () => {
    const table = computeTable([], league);
    expect(table.map((r) => r.points)).toEqual([0, 0, 0, 0]);
    expect(table.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it('counts wins, draws, losses, goals and points', () => {
    const table = computeTable([fx('club_a', 'club_b', 3, 1), fx('club_c', 'club_d', 2, 2), fx('club_b', 'club_c', 0, 1, 2)], league);
    const a = table.find((r) => r.clubId === 'club_a')!;
    expect(a).toMatchObject({ played: 1, won: 1, goalsFor: 3, goalsAgainst: 1, goalDifference: 2, points: 3, position: 2 });
    const c = table.find((r) => r.clubId === 'club_c')!;
    expect(c).toMatchObject({ played: 2, won: 1, drawn: 1, points: 4 });
    expect(table[0].clubId).toBe('club_c');
  });

  it('ignores unplayed fixtures and other competitions', () => {
    const other = { ...fx('club_a', 'club_b', 5, 0), competitionId: 'comp_cup' };
    const table = computeTable([fx('club_a', 'club_b', null), other], league);
    expect(table.every((r) => r.played === 0)).toBe(true);
  });

  it('breaks ties by goal difference, then goals scored', () => {
    // A and B both 3 pts; A has better GD. C and D both 0 pts, same GD; D scored more.
    const table = computeTable([fx('club_a', 'club_c', 3, 0), fx('club_b', 'club_d', 2, 1)], league);
    expect(table.map((r) => r.clubId)).toEqual(['club_a', 'club_b', 'club_d', 'club_c']);

    const goals = computeTable([fx('club_a', 'club_c', 3, 2), fx('club_b', 'club_d', 2, 1)], league);
    expect(goals.slice(0, 2).map((r) => r.clubId)).toEqual(['club_a', 'club_b']);
  });

  it('breaks remaining ties by head-to-head', () => {
    // A: lost 0–1 to B, beat C 2–0, drew D 0–0 → 4 pts, 2 scored, 1 conceded.
    // B: beat A 1–0, drew C 1–1             → 4 pts, 2 scored, 1 conceded.
    // Level on points, GD and goals scored; B won the head-to-head.
    // Without the rule, the id fallback would put club_a first.
    const fixtures = [
      fx('club_b', 'club_a', 1, 0, 1),
      fx('club_a', 'club_c', 2, 0, 2),
      fx('club_a', 'club_d', 0, 0, 3),
      fx('club_b', 'club_c', 1, 1, 3),
    ];
    const table = computeTable(fixtures, league);
    const a = table.find((r) => r.clubId === 'club_a')!;
    const b = table.find((r) => r.clubId === 'club_b')!;
    expect([a.points, a.goalDifference, a.goalsFor]).toEqual([b.points, b.goalDifference, b.goalsFor]);
    expect(b.position).toBe(1);
    expect(a.position).toBe(2);
  });

  it('records the last five results, oldest first', () => {
    const fixtures = [1, 2, 3, 4, 5, 6].map((md) => fx('club_a', 'club_b', md % 2, 0, md));
    expect(computeTable(fixtures, league).find((r) => r.clubId === 'club_a')!.form).toEqual(['D', 'W', 'D', 'W', 'D']);
  });

  it('marks zones', () => {
    const table = computeTable([], league);
    expect(table[0].zone).toBe('champion');
    expect(table[3].zone).toBe('relegation');
    expect(table[1].zone).toBeNull();
    const lower = { ...league, tier: 2, rules: { ...league.rules, promotionPlaces: 1 } };
    expect(zoneFor(1, 4, lower)).toBe('promotion');
  });
});

describe('player season stats', () => {
  const line = (playerId: string, side: 'home' | 'away', goals: number, assists: number, rating: number) => ({
    playerId, side, position: 'ST' as const, started: true, minutes: 90, goals, assists, yellowCards: 0, redCard: false, rating,
  });
  const fixtures = [
    fx('club_a', 'club_b', 2, 0, 1, { players: [line('plr_1', 'home', 2, 0, 8.5), line('plr_2', 'away', 0, 0, 6)], playerOfTheMatch: 'plr_1' }),
    fx('club_b', 'club_a', 1, 1, 2, { players: [line('plr_1', 'away', 1, 1, 7.5), line('plr_2', 'home', 1, 0, 7)] }),
  ];
  const stats = seasonPlayerStats(fixtures);

  it('totals appearances, goals, assists and averages ratings', () => {
    const p1 = stats.find((s) => s.playerId === 'plr_1')!;
    expect(p1).toMatchObject({ clubId: 'club_a', appearances: 2, goals: 3, assists: 1, minutes: 180, playerOfTheMatch: 1, averageRating: 8 });
  });

  it('ranks scorers and assisters', () => {
    expect(topScorers(stats).map((s) => s.playerId)).toEqual(['plr_1', 'plr_2']);
    expect(topAssists(stats).map((s) => s.playerId)).toEqual(['plr_1']);
  });
});
