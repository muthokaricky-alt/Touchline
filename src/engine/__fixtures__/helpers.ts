import { buildFictionalDatabase } from '@/data/fictional';
import type { ClubId } from '@/data/schemas';
import type { FormationId } from '@/game/formations';
import { autoPickLineup } from '@/game/lineup';
import { buildMatchTeam } from '@/game/match/build-match-team';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS, type Tactics } from '@/game/tactics/tactics';

import { simulateMatch } from '../simulate';
import type { MatchInput, MatchResult, MatchTeamInput } from '../types';

/**
 * Shared fixtures for engine tests. Lives in __fixtures__ (not __tests__)
 * because Jest treats every file in a __tests__ folder as a test suite.
 */

export const db = buildFictionalDatabase();

export const CLUBS = {
  strongest: 'club_kestrel_bay',
  middle: 'club_greywater_town',
  weakest: 'club_westhaven_albion',
} as const;

export function team(clubId: ClubId, tactics: Partial<Tactics> = {}, formation: FormationId = '4-4-2'): MatchTeamInput {
  const squad = selectSquadCandidates(db, clubId);
  return buildMatchTeam(db, clubId, autoPickLineup(squad, formation), { ...DEFAULT_TACTICS, ...tactics });
}

/**
 * The same team with every player id suffixed ("plr_0045" → "plr_0045_b"),
 * so a club can face an identical copy of itself (equal-strength tests)
 * without the two sides sharing ids.
 */
export function mirror(input: MatchTeamInput): MatchTeamInput {
  const rename = (id: string) => `${id}_b`;
  return {
    ...input,
    name: `${input.name} (B)`,
    squad: input.squad.map(({ player, attributes }) => ({
      player: { ...player, id: rename(player.id) },
      attributes: { ...attributes, playerId: rename(player.id) },
    })),
    lineup: {
      ...input.lineup,
      starters: Object.fromEntries(Object.entries(input.lineup.starters).map(([slot, id]) => [slot, id ? rename(id) : null])),
      substitutes: input.lineup.substitutes.map(rename),
    },
  };
}

export function simulateMany(count: number, makeInput: (seed: number) => MatchInput): MatchResult[] {
  return Array.from({ length: count }, (_, i) => simulateMatch(makeInput(1000 + i)));
}

export type Aggregate = {
  matches: number;
  goalsPerMatch: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  nilNilPct: number;
  shotsPerTeam: number;
  onTargetPct: number;
  conversionPct: number;
  xgPerTeam: number;
  foulsPerMatch: number;
  yellowsPerMatch: number;
  redsPerMatch: number;
  subsPerTeam: number;
  homePossession: number;
  homeGoals: number;
  awayGoals: number;
  homeShots: number;
  awayShots: number;
  homeFouls: number;
};

export function aggregate(results: readonly MatchResult[]): Aggregate {
  const n = results.length;
  const sum = (f: (r: MatchResult) => number) => results.reduce((s, r) => s + f(r), 0);
  const shots = sum((r) => r.stats.home.shots + r.stats.away.shots);
  const onTarget = sum((r) => r.stats.home.shotsOnTarget + r.stats.away.shotsOnTarget);
  const goals = sum((r) => r.score.home + r.score.away);
  const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    matches: n,
    goalsPerMatch: round(goals / n),
    homeWinPct: round((100 * results.filter((r) => r.score.home > r.score.away).length) / n, 1),
    drawPct: round((100 * results.filter((r) => r.score.home === r.score.away).length) / n, 1),
    awayWinPct: round((100 * results.filter((r) => r.score.home < r.score.away).length) / n, 1),
    nilNilPct: round((100 * results.filter((r) => r.score.home + r.score.away === 0).length) / n, 1),
    shotsPerTeam: round(shots / (2 * n), 1),
    onTargetPct: round((100 * onTarget) / shots, 1),
    conversionPct: round((100 * goals) / shots, 1),
    xgPerTeam: round(sum((r) => r.stats.home.xg + r.stats.away.xg) / (2 * n)),
    foulsPerMatch: round(sum((r) => r.stats.home.fouls + r.stats.away.fouls) / n, 1),
    yellowsPerMatch: round(sum((r) => r.stats.home.yellowCards + r.stats.away.yellowCards) / n),
    redsPerMatch: round(sum((r) => r.stats.home.redCards + r.stats.away.redCards) / n, 3),
    subsPerTeam: round(sum((r) => r.events.filter((e) => e.type === 'substitution').length) / (2 * n)),
    homePossession: round(sum((r) => r.stats.home.possession) / n, 1),
    homeGoals: round(sum((r) => r.score.home) / n),
    awayGoals: round(sum((r) => r.score.away) / n),
    homeShots: round(sum((r) => r.stats.home.shots) / n, 1),
    awayShots: round(sum((r) => r.stats.away.shots) / n, 1),
    homeFouls: round(sum((r) => r.stats.home.fouls) / n, 1),
  };
}
