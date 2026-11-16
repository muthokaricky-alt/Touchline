import type { ClubId, CompetitionId, League } from '@/data/schemas';
import { createRng, type Rng } from '@/utils/random';

import { mixSeed, type Fixture, type Season } from './season';
import { computeTable, type TableRow } from './table';

/**
 * The Continental Cup's group stage (user's design: 6 groups of 4, home and
 * away; the top two and the four best third-placed clubs reach a single-leg
 * Round of 16; pots + country protection in the group draw; group winners
 * and the two best runners-up seeded in the Round of 16, no group rematch).
 *
 * Rounds (fixture `matchday`): 1–6 the group matchdays, 7 Round of 16,
 * 8 quarter-finals, 9 semi-finals, 10 final. Group membership is stored on
 * the season cup (`groups`); tables are derived from results, like leagues.
 * Pure functions; the generic cup code in cup.ts calls these when a cup has
 * groups.
 */

export const GROUP_MATCHDAYS = 6;
/** Round of 16, quarter-finals, semi-finals, final. */
export const KNOCKOUT_ROUNDS = 4;
export const GROUP_STAGE_ROUNDS = GROUP_MATCHDAYS + KNOCKOUT_ROUNDS;
const THIRDS_THROUGH = 4;

export const groupName = (index: number) => `Group ${String.fromCharCode(65 + index)}`;

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The group draw. Entrants come strongest first in pots of `groupCount`
 * (champions, runners-up, thirds, fourths); every group gets one club from
 * each pot. When every pot has one club per country (6 countries × 4 places),
 * no group has two clubs from the same country: country c of pot p goes to
 * group (c + shift_p) mod n with a different shift per pot (a Latin square
 * with shuffled countries and shifts). Otherwise each pot is shuffled into
 * the groups. Seeded.
 */
export function drawGroups(entrants: readonly ClubId[], countryOf: (id: ClubId) => string, groupCount: number, seed: number): ClubId[][] {
  const rng = createRng(mixSeed(seed, 2024));
  const pots = Array.from({ length: Math.ceil(entrants.length / groupCount) }, (_, p) => entrants.slice(p * groupCount, (p + 1) * groupCount));
  const groups: ClubId[][] = Array.from({ length: groupCount }, () => []);
  const countries = shuffle(rng, [...new Set(entrants.map(countryOf))]);
  const protectable = countries.length === groupCount && pots.every((pot) => pot.length === groupCount && new Set(pot.map(countryOf)).size === groupCount);
  const shifts = shuffle(rng, Array.from({ length: groupCount }, (_, i) => i));
  pots.forEach((pot, p) => {
    if (protectable) {
      for (const club of pot) groups[(countries.indexOf(countryOf(club)) + shifts[p]) % groupCount].push(club);
    } else {
      shuffle(rng, pot).forEach((club, g) => groups[g].push(club));
    }
  });
  return groups;
}

/** Home and away for four clubs [a, b, c, d]: each plays three at home, three away. */
const GROUP_PAIRINGS: readonly (readonly [number, number])[][] = [
  [[0, 1], [2, 3]],
  [[2, 0], [3, 1]],
  [[0, 3], [1, 2]],
  [[1, 0], [3, 2]],
  [[0, 2], [1, 3]],
  [[3, 0], [2, 1]],
];

/** Every group-stage fixture, on the cup's first GROUP_MATCHDAYS round dates. */
export function groupStageFixtures(cupId: CompetitionId, groups: readonly ClubId[][], roundDates: readonly string[], startYear: number): Fixture[] {
  const shortYear = String(startYear % 100).padStart(2, '0');
  const base = cupId.replace(/^comp_/, '');
  return GROUP_PAIRINGS.flatMap((pairs, m) =>
    groups.flatMap((group, g) =>
      pairs.map(([home, away], n) => ({
        id: `fx_${base}_${shortYear}_g${g + 1}_m${m + 1}_${n + 1}`,
        competitionId: cupId,
        matchday: m + 1,
        date: roundDates[m],
        homeId: group[home],
        awayId: group[away],
        result: null,
      })),
    ),
  );
}

/** A group as a tiny league, so the table code (and its tie-breakers) can rank it. */
function groupLeague(cupId: CompetitionId, clubIds: readonly ClubId[]): League {
  return {
    id: cupId,
    type: 'league',
    name: 'Group',
    shortName: 'Group',
    country: 'INT',
    tier: 1,
    clubIds: [...clubIds],
    rules: { roundsPerOpponent: 2, points: { win: 3, draw: 1, loss: 0 }, promotionPlaces: 0, relegationPlaces: 0 },
  };
}

/** Each group's table so far (points, goal difference, goals, head-to-head, id). */
export function groupTables(season: Season, cupId: CompetitionId, groups: readonly ClubId[][]): TableRow[][] {
  const groupFixtures = season.fixtures.filter((f) => f.competitionId === cupId && f.matchday <= GROUP_MATCHDAYS);
  return groups.map((group) => computeTable(groupFixtures, groupLeague(cupId, group)));
}

export const groupStageComplete = (season: Season, cupId: CompetitionId) =>
  season.fixtures.filter((f) => f.competitionId === cupId && f.matchday <= GROUP_MATCHDAYS).every((f) => f.result !== null);

/** Ranks rows from different groups (thirds, runners-up): points, goal difference, goals, then id. */
function rankAcrossGroups(rows: readonly TableRow[]): TableRow[] {
  return [...rows].sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.clubId.localeCompare(b.clubId));
}

export type GroupOutcome = {
  /** The 16 clubs through, with their group index. */
  through: { clubId: ClubId; group: number; place: number }[];
  /** Group winners and the best runners-up (as many as needed to make 8): seeded in the Round of 16. */
  seeded: ClubId[];
  unseeded: ClubId[];
};

/** Who reached the Round of 16 (call once the group stage is complete). */
export function groupOutcome(tables: readonly TableRow[][]): GroupOutcome {
  const at = (place: number) => tables.map((t, group) => ({ row: t[place], group })).filter((x) => x.row !== undefined);
  const winners = at(0);
  const runnersUp = at(1);
  const thirds = rankAcrossGroups(at(2).map((x) => x.row)).slice(0, THIRDS_THROUGH);
  const groupOf = (id: ClubId) => tables.findIndex((t) => t.some((r) => r.clubId === id));
  const rankedRunnersUp = rankAcrossGroups(runnersUp.map((x) => x.row)).map((r) => r.clubId);
  const seedSlots = Math.max(0, (winners.length + runnersUp.length + thirds.length) / 2 - winners.length);
  const seeded = [...winners.map((x) => x.row.clubId), ...rankedRunnersUp.slice(0, seedSlots)];
  const unseeded = [...rankedRunnersUp.slice(seedSlots), ...thirds.map((r) => r.clubId)];
  return {
    through: [
      ...winners.map((x) => ({ clubId: x.row.clubId, group: x.group, place: 1 })),
      ...runnersUp.map((x) => ({ clubId: x.row.clubId, group: x.group, place: 2 })),
      ...thirds.map((r) => ({ clubId: r.clubId, group: groupOf(r.clubId), place: 3 })),
    ],
    seeded,
    unseeded,
  };
}

/**
 * Round of 16 pairs: each seeded club at home against an unseeded one from
 * another group (seeded random order; backtracks if a draw would force a
 * group rematch, falls back to a plain draw if none exists).
 */
export function drawRoundOf16(outcome: GroupOutcome, seed: number): [ClubId, ClubId][] {
  const rng = createRng(mixSeed(seed, 1007));
  const groupOf = new Map(outcome.through.map((t) => [t.clubId, t.group]));
  const seeds = shuffle(rng, outcome.seeded);
  const pool = shuffle(rng, outcome.unseeded);
  const pairs: [ClubId, ClubId][] = [];
  const used = new Set<ClubId>();
  const assign = (i: number): boolean => {
    if (i === seeds.length) return true;
    for (const opponent of pool) {
      if (used.has(opponent) || groupOf.get(opponent) === groupOf.get(seeds[i])) continue;
      used.add(opponent);
      pairs.push([seeds[i], opponent]);
      if (assign(i + 1)) return true;
      pairs.pop();
      used.delete(opponent);
    }
    return false;
  };
  if (assign(0)) return pairs;
  return seeds.map((s, i) => [s, pool[i]]);
}

/** "Group stage · Matchday 3", or the knockout round's name. */
export function groupCupRoundName(round: number): string {
  if (round <= GROUP_MATCHDAYS) return `Group stage · Matchday ${round}`;
  return ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'][round - GROUP_MATCHDAYS - 1] ?? `Round ${round}`;
}
