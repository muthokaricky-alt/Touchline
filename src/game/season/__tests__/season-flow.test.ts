import { buildFictionalDatabase } from '@/data/fictional';
import { domesticWorld } from '@/data/fictional/__fixtures__/domestic';
import { autoPickLineup } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { cupFixtures, cupWinner, tieWinner } from '../cup';
import { seasonPlayerStats } from '../player-stats';
import { playUserFixture } from '../__fixtures__/play';
import { mixSeed, SeasonSchema, type Season } from '../season';
import {
  advanceToUserFixture,
  createSeason,
  isSeasonComplete,
  leagueOfClub,
  leagueTable,
  nextDate,
  nextFixtureFor,
  nextMemberships,
  playRemaining,
  seasonOutcome,
  startNextSeason,
  totalMatchdays,
  type UserTeam,
} from '../season-flow';

/** The full world (with the leagues abroad), for the tests about it; `db` (England only) for the rest, which play whole seasons. */
const world = buildFictionalDatabase();
const db = domesticWorld(world);
const USER = 'club_greywater_town';
const FIRST = 'comp_first_division';
const SECOND = 'comp_second_division';
const CUP = 'comp_national_cup';
const user: UserTeam = { clubId: USER, lineup: autoPickLineup(selectSquadCandidates(db, USER), '4-4-2'), tactics: DEFAULT_TACTICS };

/** Plays the user's fixtures until none are left, then everything else. */
function playFullSeason(start: Season): Season {
  let season = start;
  while (nextFixtureFor(season, USER)) season = playUserFixture(db, season, user).season;
  return playRemaining(db, season).season;
}

describe('createSeason', () => {
  const season = createSeason(world, 2026, 1234);

  it('schedules England’s two 20-club leagues (38 matchdays), the leagues abroad and the first cup round', () => {
    expect(SeasonSchema.safeParse(season).success).toBe(true);
    // England first (so its fixture seeds never change), then the five leagues abroad.
    expect(season.leagues.map((l) => [l.competitionId, l.clubIds.length])).toEqual([
      [FIRST, 20],
      [SECOND, 20],
      ['comp_kenya_premier', 18],
      ['comp_france_premier', 18],
      ['comp_germany_premier', 18],
      ['comp_italy_premier', 18],
      ['comp_spain_premier', 18],
    ]);
    expect(totalMatchdays(season, 'comp_kenya_premier')).toBe(34);
    // Only England's 40 clubs enter the National Cup.
    expect(season.cupEntrantLeagues).toEqual([FIRST, SECOND]);
    expect(cupFixtures(season).every((f) => [f.homeId, f.awayId].every((id) => season.leagues.slice(0, 2).some((l) => l.clubIds.includes(id))))).toBe(true);
    expect(totalMatchdays(season, FIRST)).toBe(38);
    expect(totalMatchdays(season, SECOND)).toBe(38);
    expect(season.fixtures.filter((f) => f.competitionId === FIRST)).toHaveLength(380);
    expect(cupFixtures(season)).toHaveLength(8);
    expect(leagueOfClub(season, USER)).toBe(FIRST);
  });

  it('starts with the earliest fixture date first', () => {
    expect(nextDate(season)).toBe('2026-08-08');
  });
});

describe('advanceToUserFixture', () => {
  const start = createSeason(db, 2026, 1234);
  const { season, fixture, result } = advanceToUserFixture(db, start, user);

  it("plays the user's match and everything else on that date", () => {
    expect(fixture.date).toBe('2026-08-08');
    expect([result.home.clubId, result.away.clubId]).toContain(USER);
    const sameDay = season.fixtures.filter((f) => f.date === fixture.date);
    expect(sameDay).toHaveLength(20); // 10 First + 10 Second Division (the leagues abroad play too in the full world)
    expect(sameDay.every((f) => f.result)).toBe(true);
    expect(season.fixtures.filter((f) => f.date > fixture.date).every((f) => !f.result)).toBe(true);
  });

  it('keeps running player totals instead of per-match lines', () => {
    const stats = seasonPlayerStats(season, FIRST);
    const goals = season.fixtures.filter((f) => f.competitionId === FIRST && f.result).reduce((s, f) => s + f.result!.score.home + f.result!.score.away, 0);
    expect(stats.reduce((s, p) => s + p.goals, 0)).toBe(goals);
    expect(stats.every((p) => p.appearances === 1)).toBe(true);
  });

  it('does not modify the season it was given', () => {
    expect(start.fixtures.every((f) => f.result === null)).toBe(true);
  });
});

describe('a full season', () => {
  const finished = playFullSeason(createSeason(db, 2026, 99));
  const outcome = seasonOutcome(db, finished);

  it('plays every league fixture and the whole cup', () => {
    expect(isSeasonComplete(finished)).toBe(true);
    expect(finished.fixtures.every((f) => f.result)).toBe(true);
    // 40 entrants: 8 + 16 + 8 + 4 + 2 + 1 ties.
    expect(cupFixtures(finished)).toHaveLength(39);
    expect(cupWinner(finished)).not.toBeNull();
    expect(cupFixtures(finished).every((f) => tieWinner(f) !== null)).toBe(true);
    expect(SeasonSchema.safeParse(finished).success).toBe(true);
  });

  it('gives consistent tables', () => {
    for (const id of [FIRST, SECOND]) {
      const table = leagueTable(db, finished, id);
      expect(table.every((r) => r.played === 38)).toBe(true);
      expect(table.reduce((s, r) => s + r.goalsFor, 0)).toBe(table.reduce((s, r) => s + r.goalsAgainst, 0));
    }
  });

  it('identifies 3 relegated and 3 promoted clubs', () => {
    const first = outcome.leagues.find((l) => l.competitionId === FIRST)!;
    const second = outcome.leagues.find((l) => l.competitionId === SECOND)!;
    expect(first.relegated).toHaveLength(3);
    expect(first.promoted).toHaveLength(0);
    expect(second.promoted).toHaveLength(3);
    expect(second.relegated).toHaveLength(0);
  });

  it('swaps them for next season and keeps both leagues at 20', () => {
    const memberships = nextMemberships(db, finished);
    const first = memberships.find((m) => m.competitionId === FIRST)!;
    const second = memberships.find((m) => m.competitionId === SECOND)!;
    expect(first.clubIds).toHaveLength(20);
    expect(second.clubIds).toHaveLength(20);
    const out = outcome.leagues.find((l) => l.competitionId === FIRST)!.relegated;
    const up = outcome.leagues.find((l) => l.competitionId === SECOND)!.promoted;
    out.forEach((id) => expect(second.clubIds).toContain(id));
    up.forEach((id) => expect(first.clubIds).toContain(id));
  });

  it('rolls over with promotion applied', () => {
    const next = startNextSeason(db, finished);
    expect(next.label).toBe('2027/28');
    expect(next.leagues).toEqual(nextMemberships(db, finished));
    expect(next.fixtures.every((f) => f.result === null)).toBe(true);
    expect(next.playerStats).toEqual([]);
    expect(SeasonSchema.safeParse(next).success).toBe(true);
  });

  it('keeps each country’s clubs in its own league; no promotion or relegation abroad', () => {
    // Full world, results filled in without simulating (only the tables matter here): every home side wins.
    const start = createSeason(world, 2026, 99);
    const filled = {
      ...start,
      fixtures: start.fixtures.map((f) => ({ ...f, result: { score: { home: 1, away: 0 }, goals: [], cards: [], playerOfTheMatch: null } })),
    };
    const next = nextMemberships(world, filled);
    for (const league of next.filter((m) => m.competitionId.endsWith('_premier'))) {
      const before = start.leagues.find((l) => l.competitionId === league.competitionId)!;
      expect([...league.clubIds].sort()).toEqual([...before.clubIds].sort());
    }
    // England still promotes and relegates three.
    const first = next.find((m) => m.competitionId === FIRST)!;
    expect(first.clubIds.filter((id) => !start.leagues[0].clubIds.includes(id))).toHaveLength(3);
  });

  it('averages a believable number of goals', () => {
    const league = finished.fixtures.filter((f) => f.competitionId !== CUP);
    const goals = league.reduce((s, f) => s + f.result!.score.home + f.result!.score.away, 0) / league.length;
    expect(goals).toBeGreaterThan(2.2);
    expect(goals).toBeLessThan(3.6);
  });
});

describe('mixSeed', () => {
  it('always gives a non-negative 31-bit integer', () => {
    for (let seed = 0; seed < 2000; seed += 7) {
      for (const salt of [0, 1, 99, 4242, 1006]) {
        const s = mixSeed(seed * 104_729, salt);
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(2_147_483_647);
      }
    }
  });
});

describe('rules', () => {
  it('cannot start the next season early or play past the end', () => {
    const season = createSeason(db, 2026, 3);
    expect(() => startNextSeason(db, season)).toThrow(/still in progress/);
  });

  it('is deterministic for the same seed and choices', () => {
    const a = advanceToUserFixture(db, createSeason(db, 2026, 21), user);
    const b = advanceToUserFixture(db, createSeason(db, 2026, 21), user);
    expect(b.season).toEqual(a.season);
    expect(b.result).toEqual(a.result);
  });
});
