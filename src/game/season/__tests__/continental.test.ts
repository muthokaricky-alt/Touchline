import { buildFictionalDatabase } from '@/data/fictional';
import { weekdayOf } from '@/utils/date';

import {
  drawGroups,
  drawRoundOf16,
  GROUP_MATCHDAYS,
  groupCupRoundName,
  groupOutcome,
  groupStageComplete,
  groupStageFixtures,
  groupTables,
} from '../continental';
import { cupFixtures, cupRoundLabel, cupWinner, isKnockoutFixture, nextCupRound } from '../cup';
import type { Fixture, Season } from '../season';
import { createSeason } from '../season-flow';

const world = buildFictionalDatabase();
const CUP = 'comp_continental_cup';
const season = createSeason(world, 2026, 1234);
const cup = season.cups.find((c) => c.competitionId === CUP)!;
const countryOf = (id: string) => world.clubs.find((c) => c.id === id)!.country;

/** Fills every unplayed fixture of `round` with a result: the club listed first in the season's entrants wins (ties at home otherwise). */
function playRound(s: Season, round: number, score: (f: Fixture) => { home: number; away: number }): Season {
  const fixtures = s.fixtures.map((f) =>
    f.competitionId === CUP && f.matchday === round && !f.result ? { ...f, result: { score: score(f), goals: [], cards: [], playerOfTheMatch: null } } : f,
  );
  const next = { ...s, fixtures };
  const drawn = nextCupRound(next, CUP);
  return { ...next, fixtures: [...next.fixtures, ...drawn] };
}
const rank = (id: string) => cup.entrants!.indexOf(id);
/** The stronger entrant (earlier in the list) wins 2–0; home wins 1–0 if equal. */
const favouriteWins = (f: Fixture) => (rank(f.homeId) <= rank(f.awayId) ? { home: 2, away: 0 } : { home: 0, away: 2 });

describe('Continental Cup groups', () => {
  it('draws six groups of four: one club from each pot, never two from the same country', () => {
    const groups = cup.groups!;
    expect(groups).toHaveLength(6);
    for (const group of groups) {
      expect(group).toHaveLength(4);
      expect(new Set(group.map(countryOf)).size).toBe(4);
      // Pot p (entrants p·6 … p·6+5) gives each group its p-th club.
      group.forEach((club, p) => expect(Math.floor(rank(club) / 6)).toBe(p));
    }
    expect(drawGroups(cup.entrants!, countryOf, 6, 99)).toEqual(drawGroups(cup.entrants!, countryOf, 6, 99));
  });

  it('plays home and away: 72 group matches on six Tuesdays, three at home for every club', () => {
    const groupMatches = cupFixtures(season, CUP);
    expect(groupMatches).toHaveLength(72);
    expect(new Set(groupMatches.map((f) => f.date)).size).toBe(GROUP_MATCHDAYS);
    expect(groupMatches.every((f) => weekdayOf(f.date) === 2)).toBe(true);
    for (const club of cup.entrants!) {
      expect(groupMatches.filter((f) => f.homeId === club)).toHaveLength(3);
      expect(groupMatches.filter((f) => f.awayId === club)).toHaveLength(3);
    }
    expect(groupStageFixtures(CUP, cup.groups!, cup.roundDates!, 2026).map((f) => f.id)).toEqual(groupMatches.map((f) => f.id));
    // Group matches may end level; knockout ties go to penalties.
    expect(isKnockoutFixture(season, groupMatches[0])).toBe(false);
    expect(cupRoundLabel(season, CUP, 3)).toBe('Group stage · Matchday 3');
    expect(groupCupRoundName(7)).toBe('Round of 16');
  });

  it('sends the top two and the four best thirds through; winners and the two best runners-up are seeded', () => {
    let s = season;
    for (let m = 1; m <= GROUP_MATCHDAYS; m++) s = playRound(s, m, favouriteWins);
    expect(groupStageComplete(s, CUP)).toBe(true);
    const outcome = groupOutcome(groupTables(s, CUP, cup.groups!));
    expect(outcome.through).toHaveLength(16);
    expect(outcome.through.filter((t) => t.place === 3)).toHaveLength(4);
    expect(outcome.seeded).toHaveLength(8);
    // With the favourite winning every match, the winners are the pot-1 clubs (the champions).
    expect(outcome.seeded.slice(0, 6).sort()).toEqual(cup.entrants!.slice(0, 6).sort());

    // Round of 16: drawn as soon as the groups end, seeded clubs at home, no group rematch.
    const r16 = cupFixtures(s, CUP).filter((f) => f.matchday === GROUP_MATCHDAYS + 1);
    expect(r16).toHaveLength(8);
    const groupOf = (id: string) => cup.groups!.findIndex((g) => g.includes(id));
    for (const f of r16) {
      expect(outcome.seeded).toContain(f.homeId);
      expect(groupOf(f.homeId)).not.toBe(groupOf(f.awayId));
      expect(f.date).toBe(cup.roundDates![GROUP_MATCHDAYS]);
    }
    expect(drawRoundOf16(outcome, 5)).toEqual(drawRoundOf16(outcome, 5));

    // Knockouts to the final (level scores would go to penalties; here the favourite wins).
    for (let round = GROUP_MATCHDAYS + 1; round <= GROUP_MATCHDAYS + 4; round++) s = playRound(s, round, favouriteWins);
    expect(cupFixtures(s, CUP)).toHaveLength(72 + 8 + 4 + 2 + 1);
    expect(cupWinner(s, CUP)).toBe(cup.entrants![0]);
  });
});
