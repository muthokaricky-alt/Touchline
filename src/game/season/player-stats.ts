import type { ClubId, PlayerId } from '@/data/schemas';

import type { Fixture } from './season';

/**
 * Season statistics per player, derived from stored fixture results
 * (never stored themselves, so they can't disagree with the results).
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

export function seasonPlayerStats(fixtures: readonly Fixture[]): PlayerSeasonStats[] {
  const stats = new Map<PlayerId, PlayerSeasonStats & { ratingTotal: number }>();
  for (const fixture of fixtures) {
    if (!fixture.result) continue;
    for (const line of fixture.result.players) {
      const clubId = line.side === 'home' ? fixture.homeId : fixture.awayId;
      const s =
        stats.get(line.playerId) ??
        { playerId: line.playerId, clubId, appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, playerOfTheMatch: 0, averageRating: 0, ratingTotal: 0 };
      s.clubId = clubId;
      s.appearances++;
      if (line.started) s.starts++;
      s.minutes += line.minutes;
      s.goals += line.goals;
      s.assists += line.assists;
      s.yellowCards += line.yellowCards;
      if (line.redCard) s.redCards++;
      if (fixture.result.playerOfTheMatch === line.playerId) s.playerOfTheMatch++;
      s.ratingTotal += line.rating;
      stats.set(line.playerId, s);
    }
  }
  return [...stats.values()].map(({ ratingTotal, ...s }) => ({
    ...s,
    averageRating: Math.round((ratingTotal / s.appearances) * 10) / 10,
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
