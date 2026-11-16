import { buildFictionalDatabase } from '@/data/fictional';
import { weekdayOf } from '@/utils/date';

import {
  aggregateScore,
  drawGroups,
  drawRoundOf16,
  GROUP_MATCHDAYS,
  groupCupRoundName,
  groupOutcome,
  groupStageComplete,
  groupStageFixtures,
  groupTables,
  otherLeg,
  TWO_LEG_ROUNDS,
  twoLegWinner,
} from '../continental';
import { cupFixtures, cupRoundLabel, cupWinner, decidedTieWinner, isKnockoutFixture, needsPenalties, nextCupRound } from '../cup';
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
    expect(cupRoundLabel(season, CUP, 7)).toBe('Round of 16 · 1st leg');
    expect(cupRoundLabel(season, CUP, 12)).toBe('Semi-finals · 2nd leg');
    expect(cupRoundLabel(season, CUP, 13)).toBe('Final');
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

    // Round of 16: both legs drawn as soon as the groups end; the seeded club hosts the 2nd leg; no group rematch.
    const first = cupFixtures(s, CUP).filter((f) => f.matchday === GROUP_MATCHDAYS + 1);
    const second = cupFixtures(s, CUP).filter((f) => f.matchday === GROUP_MATCHDAYS + 2);
    expect(first).toHaveLength(8);
    expect(second).toHaveLength(8);
    const groupOf = (id: string) => cup.groups!.findIndex((g) => g.includes(id));
    for (const f of second) {
      expect(outcome.seeded).toContain(f.homeId);
      expect(groupOf(f.homeId)).not.toBe(groupOf(f.awayId));
      expect(otherLeg(s.fixtures, f)).toMatchObject({ homeId: f.awayId, awayId: f.homeId, date: cup.roundDates![GROUP_MATCHDAYS] });
      expect(f.date).toBe(cup.roundDates![GROUP_MATCHDAYS + 1]);
    }
    expect(drawRoundOf16(outcome, 5)).toEqual(drawRoundOf16(outcome, 5));

    // Knockouts to the final (here the favourite wins every leg).
    for (let round = GROUP_MATCHDAYS + 1; round <= TWO_LEG_ROUNDS; round++) s = playRound(s, round, favouriteWins);
    expect(cupFixtures(s, CUP)).toHaveLength(72 + 16 + 8 + 4 + 1); // groups, two legs of R16/QF/SF, one-match final
    expect(cupWinner(s, CUP)).toBe(cup.entrants![0]);
  });
});

describe('two-legged ties', () => {
  // A Round of 16 tie, built by playing the group stage with the favourite winning.
  let s = season;
  for (let m = 1; m <= GROUP_MATCHDAYS; m++) s = playRound(s, m, favouriteWins);
  const leg1 = cupFixtures(s, CUP).find((f) => f.matchday === GROUP_MATCHDAYS + 1)!;
  const leg2 = otherLeg(s.fixtures, leg1)!;
  const withFirstLeg = (score: { home: number; away: number }) => ({
    ...s,
    fixtures: s.fixtures.map((f) => (f.id === leg1.id ? { ...f, result: { score, goals: [], cards: [], playerOfTheMatch: null } } : f)),
  });

  it('never goes to penalties after a first leg; after the second only if the aggregate is level', () => {
    expect(needsPenalties(s, leg1, { home: 1, away: 1 })).toBe(false);
    const after = withFirstLeg({ home: 1, away: 0 });
    expect(needsPenalties(after, leg2, { home: 1, away: 0 })).toBe(true); // 1–1 on aggregate
    expect(needsPenalties(after, leg2, { home: 2, away: 0 })).toBe(false);
    expect(needsPenalties(after, leg2, { home: 0, away: 0 })).toBe(false);
    expect(aggregateScore(otherLeg(after.fixtures, leg2), { home: 1, away: 0 })).toEqual({ home: 1, away: 1 });
  });

  it('decides the tie on aggregate, then on the second leg’s shootout; a first leg decides nothing', () => {
    const after = withFirstLeg({ home: 3, away: 0 });
    const played = (score: { home: number; away: number }, penalties?: { home: number; away: number }) => ({
      ...leg2,
      result: { score, goals: [], cards: [], playerOfTheMatch: null, ...(penalties ? { penalties } : {}) },
    });
    // 3–0 away in the first leg, 2–0 at home in the second: the first leg's hosts go through 3–2.
    expect(twoLegWinner(after.fixtures, played({ home: 2, away: 0 }))).toBe(leg1.homeId);
    expect(twoLegWinner(after.fixtures, played({ home: 3, away: 0 }, { home: 5, away: 4 }))).toBe(leg2.homeId);
    expect(decidedTieWinner(after, { ...leg1, result: after.fixtures.find((f) => f.id === leg1.id)!.result })).toBeNull();
  });
});
