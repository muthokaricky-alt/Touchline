import { leagueRounds, scheduleLeague, seasonStartDate, singleRoundRobin } from '../fixtures';
import { FixtureSchema } from '../season';
import { weekdayOf } from '@/utils/date';

const EIGHT = ['club_a', 'club_b', 'club_c', 'club_d', 'club_e', 'club_f', 'club_g', 'club_h'];

/** Longest run of consecutive home (or away) games for a club. */
function longestRun(rounds: { home: string; away: string }[][], club: string): number {
  let longest = 0;
  let run = 0;
  let last: 'H' | 'A' | null = null;
  for (const round of rounds) {
    const match = round.find((p) => p.home === club || p.away === club);
    if (!match) {
      last = null;
      run = 0;
      continue;
    }
    const venue = match.home === club ? 'H' : 'A';
    run = venue === last ? run + 1 : 1;
    last = venue;
    longest = Math.max(longest, run);
  }
  return longest;
}

describe('singleRoundRobin', () => {
  it.each([4, 6, 8, 10])('with %i clubs: everyone meets everyone exactly once, once per round', (n) => {
    const clubs = EIGHT.concat(['club_i', 'club_j']).slice(0, n);
    const rounds = singleRoundRobin(clubs);
    expect(rounds).toHaveLength(n - 1);
    const pairs = new Set<string>();
    for (const round of rounds) {
      expect(round).toHaveLength(n / 2);
      const playing = round.flatMap((p) => [p.home, p.away]);
      expect(new Set(playing).size).toBe(n);
      round.forEach((p) => pairs.add([p.home, p.away].sort().join('-')));
    }
    expect(pairs.size).toBe((n * (n - 1)) / 2);
  });

  it('gives a bye each round with an odd number of clubs', () => {
    const rounds = singleRoundRobin(EIGHT.slice(0, 7));
    expect(rounds).toHaveLength(7);
    rounds.forEach((round) => expect(round).toHaveLength(3));
  });
});

describe('leagueRounds (double round-robin)', () => {
  const rounds = leagueRounds(EIGHT, 2);

  it('plays every ordered pair exactly once (home and away)', () => {
    expect(rounds).toHaveLength(14);
    const ordered = rounds.flat().map((p) => `${p.home}>${p.away}`);
    expect(new Set(ordered).size).toBe(8 * 7);
  });

  it('gives every club 7 home and 7 away games', () => {
    for (const club of EIGHT) {
      expect(rounds.flat().filter((p) => p.home === club)).toHaveLength(7);
      expect(rounds.flat().filter((p) => p.away === club)).toHaveLength(7);
    }
  });

  it.each([4, 6, 8, 10, 16])('avoids long home or away runs with %i clubs (at most 2 in a row)', (n) => {
    const clubs = Array.from({ length: n }, (_, i) => `club_${i}`);
    const schedule = leagueRounds(clubs, 2);
    for (const club of clubs) expect(longestRun(schedule, club)).toBeLessThanOrEqual(2);
  });

  it('never repeats a pairing on consecutive matchdays', () => {
    for (let i = 1; i < rounds.length; i++) {
      const previous = new Set(rounds[i - 1].map((p) => [p.home, p.away].sort().join()));
      rounds[i].forEach((p) => expect(previous.has([p.home, p.away].sort().join())).toBe(false));
    }
  });
});

describe('scheduleLeague', () => {
  const options = { competitionId: 'comp_first_division', clubIds: EIGHT, roundsPerOpponent: 2, startYear: 2026, seed: 42 };
  const fixtures = scheduleLeague(options);

  it('produces valid, uniquely identified fixtures', () => {
    expect(fixtures).toHaveLength(56);
    fixtures.forEach((f) => expect(FixtureSchema.safeParse(f).success).toBe(true));
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(56);
  });

  it('plays matchdays on consecutive Saturdays from early August', () => {
    expect(seasonStartDate(2026)).toBe('2026-08-08');
    expect(weekdayOf(seasonStartDate(2027))).toBe(6);
    const md1 = fixtures.find((f) => f.matchday === 1)!.date;
    const md2 = fixtures.find((f) => f.matchday === 2)!.date;
    expect(md1).toBe('2026-08-08');
    expect(md2).toBe('2026-08-15');
    fixtures.forEach((f) => expect(weekdayOf(f.date)).toBe(6));
  });

  it('is deterministic per seed and differs between seeds', () => {
    expect(scheduleLeague(options)).toEqual(fixtures);
    const other = scheduleLeague({ ...options, seed: 43 });
    expect(other.map((f) => f.homeId + f.awayId)).not.toEqual(fixtures.map((f) => f.homeId + f.awayId));
  });
});
