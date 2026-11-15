import type { ClubId, GameDatabase } from '@/data/schemas';
import { seasonPlayerStats, topAssists, topScorers, type PlayerSeasonStats } from '@/game/season/player-stats';
import type { Season } from '@/game/season/season';
import { currentMatchday, findLeague } from '@/game/season/season-flow';
import { computeTable, type TableRow } from '@/game/season/table';
import { fullName } from '@/game/squad/squad-selectors';

/** View model for the Fixtures tab: matchdays, the full table, and leaderboards. Pure. */

export type FixtureRowView = {
  id: string;
  homeName: string;
  awayName: string;
  score: { home: number; away: number } | null;
  involvesUser: boolean;
  /** From the user's point of view, when played. */
  userOutcome: 'W' | 'D' | 'L' | null;
};

export type MatchdayView = {
  matchday: number;
  date: string;
  isCurrent: boolean;
  fixtures: FixtureRowView[];
};

export type TableRowView = TableRow & { clubName: string; shortName: string; isUser: boolean };

export type LeaderRowView = { playerId: string; name: string; clubShortName: string; value: number; appearances: number };

export type SeasonView = {
  label: string;
  competitionName: string;
  currentMatchday: number | null;
  matchdays: MatchdayView[];
  table: TableRowView[];
  topScorers: LeaderRowView[];
  topAssists: LeaderRowView[];
  relegationPlaces: number;
};

export function buildSeasonView(db: GameDatabase, season: Season, userClubId: ClubId): SeasonView {
  const league = findLeague(db, season.competitionId);
  const clubs = new Map(db.clubs.map((c) => [c.id, c]));
  const players = new Map(db.players.map((p) => [p.id, p]));
  const current = currentMatchday(season);

  const byMatchday = new Map<number, MatchdayView>();
  for (const f of [...season.fixtures].sort((a, b) => a.matchday - b.matchday)) {
    const day = byMatchday.get(f.matchday) ?? { matchday: f.matchday, date: f.date, isCurrent: f.matchday === current, fixtures: [] };
    const involvesUser = f.homeId === userClubId || f.awayId === userClubId;
    const score = f.result?.score ?? null;
    let userOutcome: FixtureRowView['userOutcome'] = null;
    if (score && involvesUser) {
      const [mine, theirs] = f.homeId === userClubId ? [score.home, score.away] : [score.away, score.home];
      userOutcome = mine > theirs ? 'W' : mine === theirs ? 'D' : 'L';
    }
    day.fixtures.push({
      id: f.id,
      homeName: clubs.get(f.homeId)?.name ?? f.homeId,
      awayName: clubs.get(f.awayId)?.name ?? f.awayId,
      score,
      involvesUser,
      userOutcome,
    });
    byMatchday.set(f.matchday, day);
  }

  const leaders = (rows: PlayerSeasonStats[], value: (s: PlayerSeasonStats) => number): LeaderRowView[] =>
    rows.map((s) => {
      const player = players.get(s.playerId);
      return {
        playerId: s.playerId,
        name: player ? fullName(player) : s.playerId,
        clubShortName: clubs.get(s.clubId)?.shortName ?? '',
        value: value(s),
        appearances: s.appearances,
      };
    });
  const stats = seasonPlayerStats(season.fixtures);

  return {
    label: season.label,
    competitionName: league.name,
    currentMatchday: current,
    matchdays: [...byMatchday.values()],
    table: computeTable(season.fixtures, league).map((row) => ({
      ...row,
      clubName: clubs.get(row.clubId)?.name ?? row.clubId,
      shortName: clubs.get(row.clubId)?.shortName ?? '',
      isUser: row.clubId === userClubId,
    })),
    topScorers: leaders(topScorers(stats), (s) => s.goals),
    topAssists: leaders(topAssists(stats), (s) => s.assists),
    relegationPlaces: league.rules.relegationPlaces,
  };
}
