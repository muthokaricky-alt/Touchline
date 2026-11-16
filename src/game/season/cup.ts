import type { ClubId, CompetitionId } from '@/data/schemas';
import { addDays } from '@/utils/date';
import { createRng } from '@/utils/random';

import {
  drawRoundOf16,
  GROUP_MATCHDAYS,
  GROUP_STAGE_ROUNDS,
  groupCupRoundName,
  groupOutcome,
  groupStageComplete,
  groupStageFixtures,
  groupTables,
  otherLeg,
  aggregateScore,
  TWO_LEG_ROUNDS,
  twoLegRoundName,
  twoLegStage,
  twoLegWinner,
} from './continental';
import { seasonStartDate } from './fixtures';
import { mixSeed, type Fixture, type Season } from './season';

/**
 * Knockout cup: single-leg ties, drawn round by round (a round is only drawn
 * once the previous one is complete, like a real cup draw).
 *
 * Any number of entrants: if it isn't a power of two, a first round trims
 * the field down to one. E.g. 40 entrants → first round of 8 ties (16
 * clubs, picked from the lowest tier) → 32 → 16 → 8 → 4 → 2 → final.
 */

/** Largest power of two ≤ n. */
const floorPow2 = (n: number) => 2 ** Math.floor(Math.log2(n));

export function cupRoundCount(entrants: number): number {
  if (entrants < 2) return 0;
  const main = Math.log2(floorPow2(entrants));
  return main + (entrants > floorPow2(entrants) ? 1 : 0);
}

/** "Final", "Semi-finals", "Quarter-finals", "Round of 16"…; a trimming first round is "First round". */
export function cupRoundName(round: number, totalRounds: number, entrants: number): string {
  const fromEnd = totalRounds - round; // 0 = final
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-finals';
  if (fromEnd === 2) return 'Quarter-finals';
  const hasPreliminary = entrants > floorPow2(entrants);
  if (round === 1 && hasPreliminary) return 'First round';
  return `Round of ${2 ** (fromEnd + 1)}`;
}

/**
 * Dates: ties on Wednesdays spread through the league season, the final on
 * the Saturday after the last league matchday.
 */
export function cupRoundDate(startYear: number, round: number, totalRounds: number, leagueWeeks: number): string {
  const start = seasonStartDate(startYear); // a Saturday
  if (round === totalRounds) return addDays(start, leagueWeeks * 7);
  const firstWeek = 3;
  const lastWeek = Math.max(firstWeek, leagueWeeks - 6);
  const span = Math.max(1, totalRounds - 2);
  const week = Math.round(firstWeek + ((round - 1) * (lastWeek - firstWeek)) / span);
  return addDays(start, (week - 1) * 7 + 4); // + 4 days: Saturday → Wednesday
}

export type CupDrawOptions = {
  cupId: CompetitionId;
  round: number;
  /** Clubs in this round's draw. */
  participants: readonly ClubId[];
  date: string;
  startYear: number;
  seed: number;
};

/** Random pairings (seeded); first club drawn plays at home. */
export function drawCupRound({ cupId, round, participants, date, startYear, seed }: CupDrawOptions): Fixture[] {
  if (participants.length % 2 !== 0) throw new RangeError(`A cup round needs an even number of clubs (got ${participants.length})`);
  const rng = createRng(mixSeed(seed, 1000 + round));
  const pool = [...participants];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const shortYear = String(startYear % 100).padStart(2, '0');
  const fixtures: Fixture[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    fixtures.push({
      id: `fx_${cupId.replace(/^comp_/, '')}_${shortYear}_r${round}_${i / 2 + 1}`,
      competitionId: cupId,
      matchday: round,
      date,
      homeId: pool[i],
      awayId: pool[i + 1],
      result: null,
    });
  }
  return fixtures;
}

/** Winner of a played tie (penalties decide level scores); null if unplayed or (impossibly) undecided. */
export function tieWinner(fixture: Fixture): ClubId | null {
  const r = fixture.result;
  if (!r) return null;
  const { home, away } = r.penalties && r.score.home === r.score.away ? r.penalties : r.score;
  if (home === away) return null;
  return home > away ? fixture.homeId : fixture.awayId;
}

export function tieLoser(fixture: Fixture): ClubId | null {
  const winner = tieWinner(fixture);
  if (!winner) return null;
  return winner === fixture.homeId ? fixture.awayId : fixture.homeId;
}

// --- Cup state, derived from the season --------------------------------------
//
// A season can have several cups (England's National Cup and one per
// country abroad), listed in `season.cups`. Every function takes the cup's id.

/** The season's entry for a cup, or undefined if it isn't played this season. */
export function seasonCup(season: Season, cupId: CompetitionId) {
  return season.cups.find((c) => c.competitionId === cupId);
}

/** True for a fixture of any of the season's cups. */
export const isCupFixture = (season: Season, fixture: Pick<Fixture, 'competitionId'>) =>
  season.cups.some((c) => c.competitionId === fixture.competitionId);

/** The cup's groups, when it has a group stage (the Continental Cup). */
export const cupGroups = (season: Season, cupId: CompetitionId) => seasonCup(season, cupId)?.groups;

/** A knockout tie (level after 90 minutes → penalties). Group matches can end level. */
export function isKnockoutFixture(season: Season, fixture: Pick<Fixture, 'competitionId' | 'matchday'>): boolean {
  if (!isCupFixture(season, fixture)) return false;
  return !cupGroups(season, fixture.competitionId) || fixture.matchday > GROUP_MATCHDAYS;
}

const isTwoLegged = (season: Season, cupId: CompetitionId) => Boolean(seasonCup(season, cupId)?.twoLegged && cupGroups(season, cupId));

/**
 * Does this match, ending `score`, go to penalties? Only a deciding knockout
 * match that's level: a single-leg tie level after 90 minutes, or a second
 * leg that leaves the aggregate level. Group matches and first legs can end
 * level.
 */
export function needsPenalties(season: Season, fixture: Fixture, score: { home: number; away: number }): boolean {
  if (!isKnockoutFixture(season, fixture)) return false;
  if (!isTwoLegged(season, fixture.competitionId)) return score.home === score.away;
  const stage = twoLegStage(fixture.matchday);
  if (stage?.leg === 1) return false;
  if (stage?.leg === null) return score.home === score.away; // the one-match final
  const agg = aggregateScore(otherLeg(season.fixtures, fixture), score);
  return agg !== null && agg.home === agg.away;
}

/**
 * The club that went through after this match, or null if it doesn't decide
 * a tie (a group match, a first leg) or isn't played yet.
 */
export function decidedTieWinner(season: Season, fixture: Fixture): ClubId | null {
  if (!isKnockoutFixture(season, fixture)) return null;
  if (!isTwoLegged(season, fixture.competitionId)) return tieWinner(fixture);
  const stage = twoLegStage(fixture.matchday);
  if (stage?.leg === 1) return null;
  return stage?.leg === 2 ? twoLegWinner(season.fixtures, fixture) : tieWinner(fixture);
}

/** Number of rounds, final included. */
export function cupTotalRounds(season: Season, cupId: CompetitionId): number {
  if (isTwoLegged(season, cupId)) return TWO_LEG_ROUNDS;
  return cupGroups(season, cupId) ? GROUP_STAGE_ROUNDS : cupRoundCount(cupEntrants(season, cupId).length);
}

/** "Quarter-finals", "First round", "Group stage · Matchday 2", "Round of 16 · 2nd leg"… */
export function cupRoundLabel(season: Season, cupId: CompetitionId, round: number): string {
  if (isTwoLegged(season, cupId)) return twoLegRoundName(round);
  if (cupGroups(season, cupId)) return groupCupRoundName(round);
  const entrants = cupEntrants(season, cupId).length;
  return cupRoundName(round, cupRoundCount(entrants), entrants);
}

/** The leagues entering the cup (its country's), top tier first. */
function entrantLeagues(season: Season, cupId: CompetitionId) {
  const ids = seasonCup(season, cupId)?.entrantLeagues ?? [];
  return season.leagues.filter((l) => ids.includes(l.competitionId));
}

/** Entrants: the qualified clubs (strongest first) or every club in the cup country's leagues (lowest tier last). */
export function cupEntrants(season: Season, cupId: CompetitionId): ClubId[] {
  const explicit = seasonCup(season, cupId)?.entrants;
  return explicit ? [...explicit] : entrantLeagues(season, cupId).flatMap((l) => l.clubIds);
}

/** A round's date: fixed by the season cup, or spread through its league calendar. */
function roundDate(season: Season, cupId: CompetitionId, round: number, totalRounds: number): string {
  const fixed = seasonCup(season, cupId)?.roundDates?.[round - 1];
  return fixed ?? cupRoundDate(season.startYear, round, totalRounds, cupLeagueWeeks(season, cupId));
}

export function cupFixtures(season: Season, cupId: CompetitionId): Fixture[] {
  return season.fixtures.filter((f) => f.competitionId === cupId);
}

/** Matchdays of the cup's longest league: its final is the Saturday after. */
export function cupLeagueWeeks(season: Season, cupId: CompetitionId): number {
  const leagues = new Set(seasonCup(season, cupId)?.entrantLeagues ?? []);
  return Math.max(0, ...season.fixtures.filter((f) => leagues.has(f.competitionId)).map((f) => f.matchday));
}

/**
 * The seed a cup's draws use. The first cup (the National Cup) uses the
 * season seed itself, exactly as when it was the only cup, so seasons saved
 * before the cups abroad existed draw their remaining rounds as they always
 * would have. Other cups get their own.
 */
function cupSeed(season: Season, cupId: CompetitionId): number {
  const index = season.cups.findIndex((c) => c.competitionId === cupId);
  return index <= 0 ? season.seed : mixSeed(season.seed, 5000 + index);
}

/**
 * First-round draw. When the field isn't a power of two, the clubs that must
 * play in round 1 come from the lowest tier (seeded random pick); everyone
 * else gets a bye.
 */
export function firstCupRound(season: Season, cupId: CompetitionId): Fixture[] {
  const cup = seasonCup(season, cupId);
  if (!cup) return [];
  // A group stage: every group match is known from the start.
  if (cup.groups && cup.roundDates) return groupStageFixtures(cupId, cup.groups, cup.roundDates, season.startYear);
  const entrants = cupEntrants(season, cupId);
  const total = cupRoundCount(entrants.length);
  if (total === 0) return [];
  const target = floorPow2(entrants.length);
  const needPlay = entrants.length > target ? 2 * (entrants.length - target) : entrants.length;
  const seed = cupSeed(season, cupId);

  let participants: ClubId[];
  if (seasonCup(season, cupId)?.entrants) {
    // Qualified clubs are listed strongest first: the last `needPlay` play the first round, the rest get byes.
    participants = entrants.slice(entrants.length - needPlay);
  } else {
    const leagues = entrantLeagues(season, cupId);
    const lowestTier = leagues[leagues.length - 1].clubIds;
    const rng = createRng(mixSeed(seed, 999));
    const pool = [...lowestTier];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // If the lowest tier is too small, top up from the tier above (bottom-up).
    const candidates = [...pool, ...leagues.slice(0, -1).reverse().flatMap((l) => l.clubIds)];
    participants = needPlay === entrants.length ? entrants : candidates.slice(0, needPlay);
  }

  return drawCupRound({
    cupId,
    round: 1,
    participants,
    date: roundDate(season, cupId, 1, total),
    startYear: season.startYear,
    seed,
  });
}

/**
 * If the cup's latest round is complete and more than one club remains,
 * draw the next round. Returns the new fixtures (empty if nothing to draw).
 */
export function nextCupRound(season: Season, cupId: CompetitionId): Fixture[] {
  const fixtures = cupFixtures(season, cupId);
  if (!seasonCup(season, cupId) || fixtures.length === 0) return [];
  const groups = cupGroups(season, cupId);
  if (groups) return nextGroupCupRound(season, cupId, groups, fixtures);
  const latest = Math.max(...fixtures.map((f) => f.matchday));
  const latestTies = fixtures.filter((f) => f.matchday === latest);
  if (latestTies.some((f) => !f.result)) return [];

  const losers = new Set(fixtures.map(tieLoser).filter((id): id is ClubId => id !== null));
  const remaining = cupEntrants(season, cupId).filter((id) => !losers.has(id));
  if (remaining.length < 2) return [];

  const total = cupRoundCount(cupEntrants(season, cupId).length);
  return drawCupRound({
    cupId,
    round: latest + 1,
    participants: remaining,
    date: roundDate(season, cupId, latest + 1, total),
    startYear: season.startYear,
    seed: cupSeed(season, cupId),
  });
}

/**
 * After a group stage: the Round of 16 from the group tables (seeded, no
 * group rematch), then each knockout round from the previous round's winners.
 */
function nextGroupCupRound(season: Season, cupId: CompetitionId, groups: readonly ClubId[][], fixtures: readonly Fixture[]): Fixture[] {
  if (!groupStageComplete(season, cupId)) return [];
  if (isTwoLegged(season, cupId)) return nextTwoLegRound(season, cupId, groups, fixtures);
  const knockouts = fixtures.filter((f) => f.matchday > GROUP_MATCHDAYS);
  const seed = cupSeed(season, cupId);
  const dateOf = (round: number) => roundDate(season, cupId, round, GROUP_STAGE_ROUNDS);
  const shortYear = String(season.startYear % 100).padStart(2, '0');
  if (knockouts.length === 0) {
    const round = GROUP_MATCHDAYS + 1;
    return drawRoundOf16(groupOutcome(groupTables(season, cupId, groups)), seed).map(([homeId, awayId], i) => ({
      id: `fx_${cupId.replace(/^comp_/, '')}_${shortYear}_r${round}_${i + 1}`,
      competitionId: cupId,
      matchday: round,
      date: dateOf(round),
      homeId,
      awayId,
      result: null,
    }));
  }
  const latest = Math.max(...knockouts.map((f) => f.matchday));
  const latestTies = knockouts.filter((f) => f.matchday === latest);
  if (latest >= GROUP_STAGE_ROUNDS || latestTies.some((f) => !f.result)) return [];
  const winners = latestTies.map(tieWinner).filter((id): id is ClubId => id !== null);
  return drawCupRound({ cupId, round: latest + 1, participants: winners, date: dateOf(latest + 1), startYear: season.startYear, seed });
}

/**
 * Two-legged knockouts: each stage is drawn with both legs at once (the
 * second leg the other way round), from the group outcome for the Round of
 * 16 (the seeded club at home in the second leg), then from the previous
 * stage's aggregate winners; the final is one match.
 */
function nextTwoLegRound(season: Season, cupId: CompetitionId, groups: readonly ClubId[][], fixtures: readonly Fixture[]): Fixture[] {
  const knockouts = fixtures.filter((f) => f.matchday > GROUP_MATCHDAYS);
  const seed = cupSeed(season, cupId);
  const dateOf = (round: number) => roundDate(season, cupId, round, TWO_LEG_ROUNDS);
  const base = `fx_${cupId.replace(/^comp_/, '')}_${String(season.startYear % 100).padStart(2, '0')}`;
  const legs = (firstRound: number, pairs: readonly (readonly [ClubId, ClubId])[]): Fixture[] =>
    pairs.flatMap(([firstHome, firstAway], i) => [
      { id: `${base}_r${firstRound}_${i + 1}`, competitionId: cupId, matchday: firstRound, date: dateOf(firstRound), homeId: firstHome, awayId: firstAway, result: null },
      { id: `${base}_r${firstRound + 1}_${i + 1}`, competitionId: cupId, matchday: firstRound + 1, date: dateOf(firstRound + 1), homeId: firstAway, awayId: firstHome, result: null },
    ]);

  if (knockouts.length === 0) {
    // drawRoundOf16 pairs are [seeded, unseeded]: the unseeded club hosts the first leg.
    const pairs = drawRoundOf16(groupOutcome(groupTables(season, cupId, groups)), seed).map(([seeded, other]) => [other, seeded] as const);
    return legs(GROUP_MATCHDAYS + 1, pairs);
  }
  const latest = Math.max(...knockouts.map((f) => f.matchday));
  const stage = twoLegStage(latest);
  const latestTies = knockouts.filter((f) => f.matchday === latest);
  if (!stage || stage.leg !== 2 || latestTies.some((f) => !f.result)) return [];
  const winners = latestTies.map((f) => twoLegWinner(season.fixtures, f)).filter((id): id is ClubId => id !== null);
  const nextRound = latest + 1;
  if (nextRound === TWO_LEG_ROUNDS) {
    return drawCupRound({ cupId, round: nextRound, participants: winners, date: dateOf(nextRound), startYear: season.startYear, seed });
  }
  const drawn = drawCupRound({ cupId, round: nextRound, participants: winners, date: dateOf(nextRound), startYear: season.startYear, seed });
  return legs(nextRound, drawn.map((f) => [f.homeId, f.awayId] as const));
}

/** Cup winner once the final is played, else null. */
export function cupWinner(season: Season, cupId: CompetitionId): ClubId | null {
  const fixtures = cupFixtures(season, cupId);
  const total = cupTotalRounds(season, cupId);
  const final = fixtures.find((f) => f.matchday === total);
  return final ? tieWinner(final) : null;
}
