import type { ClubId, CompetitionId, PlayerId } from '@/data/schemas';
import type { MatchResult } from '@/engine/types';

import type { Fixture, PlayerSeasonLine, Season } from './season';

/**
 * Season statistics per player per competition, kept as running totals on
 * the Season (see season.ts for why: storing every player's line from every
 * match would make a save ~4 MB).
 */
export type PlayerSeasonStats = {
  playerId: PlayerId;
  clubId: ClubId;
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  playerOfTheMatch: number;
  /** Mean match rating, 1 decimal. */
  averageRating: number;
};

/** Adds one match's player lines to the running totals. Returns a new array (immutable). */
export function addMatchToStats(lines: readonly PlayerSeasonLine[], fixture: Fixture, result: MatchResult): PlayerSeasonLine[] {
  return addMatchesToStats(lines, [{ fixture, result }]);
}

/**
 * Adds several matches at once (a whole matchday): the lookup of all
 * season lines is built once, not once per match (~4,000 lines × 65
 * matches a Saturday with the leagues abroad). Same result as adding them
 * one by one, in the same order.
 */
export function addMatchesToStats(
  lines: readonly PlayerSeasonLine[],
  matches: readonly { fixture: Fixture; result: MatchResult }[],
): PlayerSeasonLine[] {
  const byKey = new Map(lines.map((l) => [`${l.competitionId}|${l.playerId}`, l]));
  for (const { fixture, result } of matches) addOne(byKey, fixture, result);
  return [...byKey.values()];
}

function addOne(byKey: Map<string, PlayerSeasonLine>, fixture: Fixture, result: MatchResult): void {
  const key = (playerId: PlayerId) => `${fixture.competitionId}|${playerId}`;
  for (const p of result.players) {
    const clubId = p.side === 'home' ? fixture.homeId : fixture.awayId;
    const previous = byKey.get(key(p.playerId));
    byKey.set(key(p.playerId), {
      competitionId: fixture.competitionId,
      playerId: p.playerId,
      clubId,
      appearances: (previous?.appearances ?? 0) + 1,
      starts: (previous?.starts ?? 0) + (p.started ? 1 : 0),
      minutes: (previous?.minutes ?? 0) + p.minutesPlayed,
      goals: (previous?.goals ?? 0) + p.goals,
      assists: (previous?.assists ?? 0) + p.assists,
      yellowCards: (previous?.yellowCards ?? 0) + p.yellowCards,
      redCards: (previous?.redCards ?? 0) + (p.redCard ? 1 : 0),
      playerOfTheMatch: (previous?.playerOfTheMatch ?? 0) + (result.playerOfTheMatch === p.playerId ? 1 : 0),
      ratingTotal: Math.round(((previous?.ratingTotal ?? 0) + p.rating) * 10) / 10,
    });
  }
}

/** One competition's player stats (or all competitions combined, per player, when no id is given). */
export function seasonPlayerStats(season: Season, competitionId?: CompetitionId): PlayerSeasonStats[] {
  const relevant = competitionId ? season.playerStats.filter((l) => l.competitionId === competitionId) : season.playerStats;
  const merged = new Map<PlayerId, PlayerSeasonLine>();
  for (const line of relevant) {
    const m = merged.get(line.playerId);
    merged.set(
      line.playerId,
      m
        ? {
            ...m,
            clubId: line.clubId,
            appearances: m.appearances + line.appearances,
            starts: m.starts + line.starts,
            minutes: m.minutes + line.minutes,
            goals: m.goals + line.goals,
            assists: m.assists + line.assists,
            yellowCards: m.yellowCards + line.yellowCards,
            redCards: m.redCards + line.redCards,
            playerOfTheMatch: m.playerOfTheMatch + line.playerOfTheMatch,
            ratingTotal: m.ratingTotal + line.ratingTotal,
          }
        : line,
    );
  }
  return [...merged.values()].map(({ competitionId: _c, ratingTotal, ...s }) => ({
    ...s,
    averageRating: s.appearances ? Math.round((ratingTotal / s.appearances) * 10) / 10 : 0,
  }));
}

/** Most goals first; ties by assists, then fewer minutes (more efficient), then id. */
export function topScorers(stats: readonly PlayerSeasonStats[], limit = 10): PlayerSeasonStats[] {
  return stats
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.minutes - b.minutes || (a.playerId < b.playerId ? -1 : 1))
    .slice(0, limit);
}

export function topAssists(stats: readonly PlayerSeasonStats[], limit = 10): PlayerSeasonStats[] {
  return stats
    .filter((s) => s.assists > 0)
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals || a.minutes - b.minutes || (a.playerId < b.playerId ? -1 : 1))
    .slice(0, limit);
}
