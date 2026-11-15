import { buildFictionalDatabase } from '@/data/fictional';
import { autoPickLineup } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { seasonPlayerStats } from '../player-stats';
import { SeasonSchema, type Season } from '../season';
import {
  createSeason,
  currentMatchday,
  findLeague,
  isSeasonComplete,
  nextFixtureFor,
  playUserFixture,
  recordResult,
  startNextSeason,
  totalMatchdays,
  type UserTeam,
} from '../season-flow';
import { computeTable } from '../table';

const db = buildFictionalDatabase();
const LEAGUE = 'comp_first_division';
const USER = 'club_greywater_town';
const user: UserTeam = { clubId: USER, lineup: autoPickLineup(selectSquadCandidates(db, USER), '4-4-2'), tactics: DEFAULT_TACTICS };

/** Plays a whole season through the user's fixtures. */
function playFullSeason(start: Season): Season {
  let season = start;
  while (!isSeasonComplete(season)) season = playUserFixture(db, season, user).season;
  return season;
}

describe('createSeason', () => {
  const season = createSeason(db, LEAGUE, 2026, 1234);

  it('creates a valid, unplayed 14-matchday season', () => {
    expect(SeasonSchema.safeParse(season).success).toBe(true);
    expect(season.label).toBe('2026/27');
    expect(totalMatchdays(season)).toBe(14);
    expect(currentMatchday(season)).toBe(1);
    expect(nextFixtureFor(season, USER)?.matchday).toBe(1);
  });

  it('rejects an unknown competition', () => {
    expect(() => findLeague(db, 'comp_nowhere')).toThrow(RangeError);
  });
});

describe('playUserFixture', () => {
  const start = createSeason(db, LEAGUE, 2026, 1234);
  const { season, fixture, result } = playUserFixture(db, start, user);

  it("plays the user's match and the rest of the matchday", () => {
    expect(fixture.matchday).toBe(1);
    expect([result.home.clubId, result.away.clubId]).toContain(USER);
    const md1 = season.fixtures.filter((f) => f.matchday === 1);
    expect(md1.every((f) => f.result !== null)).toBe(true);
    expect(season.fixtures.filter((f) => f.matchday === 2).every((f) => f.result === null)).toBe(true);
    expect(currentMatchday(season)).toBe(2);
  });

  it('stores a compact result matching the full one', () => {
    const stored = season.fixtures.find((f) => f.id === fixture.id)!.result!;
    expect(stored.score).toEqual(result.score);
    expect(stored.goals).toHaveLength(result.score.home + result.score.away);
    expect(stored.players).toHaveLength(result.players.length);
    expect(SeasonSchema.safeParse(season).success).toBe(true);
  });

  it('does not modify the season it was given', () => {
    expect(start.fixtures.every((f) => f.result === null)).toBe(true);
  });

  it('refuses to record a fixture twice', () => {
    const stored = season.fixtures.find((f) => f.id === fixture.id)!.result!;
    expect(() => recordResult(season, fixture.id, stored)).toThrow(/already been played/);
  });
});

describe('a full season', () => {
  const start = createSeason(db, LEAGUE, 2026, 99);
  const finished = playFullSeason(start);
  const league = findLeague(db, LEAGUE);
  const table = computeTable(finished.fixtures, league);

  it('plays every fixture', () => {
    expect(isSeasonComplete(finished)).toBe(true);
    expect(finished.fixtures.every((f) => f.result)).toBe(true);
    expect(nextFixtureFor(finished, USER)).toBeNull();
    expect(() => playUserFixture(db, finished, user)).toThrow(RangeError);
  });

  it('produces a consistent table', () => {
    expect(table.every((r) => r.played === 14)).toBe(true);
    const goalsFor = table.reduce((s, r) => s + r.goalsFor, 0);
    const goalsAgainst = table.reduce((s, r) => s + r.goalsAgainst, 0);
    expect(goalsFor).toBe(goalsAgainst);
    const wins = table.reduce((s, r) => s + r.won, 0);
    const losses = table.reduce((s, r) => s + r.lost, 0);
    expect(wins).toBe(losses);
    const points = table.reduce((s, r) => s + r.points, 0);
    const draws = table.reduce((s, r) => s + r.drawn, 0) / 2;
    expect(points).toBe(wins * 3 + draws * 2);
  });

  it('gives sensible season stats', () => {
    const stats = seasonPlayerStats(finished.fixtures);
    const totalGoals = finished.fixtures.reduce((s, f) => s + f.result!.score.home + f.result!.score.away, 0);
    expect(stats.reduce((s, p) => s + p.goals, 0)).toBe(totalGoals);
    expect(totalGoals / 56).toBeGreaterThan(1.8);
    expect(totalGoals / 56).toBeLessThan(4);
  });

  it('is deterministic for the same seed and team', () => {
    expect(playFullSeason(createSeason(db, LEAGUE, 2026, 99))).toEqual(finished);
  });

  it('rolls over into next season', () => {
    const next = startNextSeason(db, finished);
    expect(next.label).toBe('2027/28');
    expect(next.startYear).toBe(2027);
    expect(next.fixtures.every((f) => f.result === null)).toBe(true);
    expect(next.fixtures[0].date.startsWith('2027-08')).toBe(true);
    expect(next.seed).not.toBe(finished.seed);
  });
});
