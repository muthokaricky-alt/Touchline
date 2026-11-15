import type { ClubId, GameDatabase } from '@/data/schemas';

import type { DashboardSummary } from './dashboard.types';

/**
 * Builds the dashboard from real game data where it exists, falling back to
 * `preview` for things later milestones will provide.
 *
 * Real now:   club, league name, club names in the table, next opponent's
 *             name, squad size, finances (wage bill summed from contracts).
 * Preview:    manager, season/dates, results, points, form, fitness/morale,
 *             injuries, inbox (until fixtures, M6, and player condition, M8).
 *
 * Preview standings are mapped onto the real clubs ranked by reputation, so
 * the table looks plausible and always contains the user's club.
 */
export function buildDashboardSummary(db: GameDatabase, clubId: ClubId, preview: DashboardSummary): DashboardSummary {
  const club = db.clubs.find((c) => c.id === clubId);
  if (!club) return preview;
  const league = db.competitions.find((c) => c.clubIds.includes(clubId));
  const leagueName = league?.name ?? preview.club.leagueName;

  const leagueClubs = db.clubs
    .filter((c) => league?.clubIds.includes(c.id) ?? c.id === clubId)
    .sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name));

  const table = leagueClubs.map((c, index) => {
    const stats = preview.table[index] ?? { played: 0, goalDifference: 0, points: 0 };
    return {
      position: index + 1,
      clubId: c.id,
      clubName: c.name,
      played: stats.played,
      goalDifference: stats.goalDifference,
      points: stats.points,
    };
  });

  const opponentRow =
    table.find((row) => row.position === preview.nextMatch.opponentPosition && row.clubId !== clubId) ??
    table.find((row) => row.clubId !== clubId);

  const contracts = db.contracts.filter((c) => c.clubId === clubId);

  return {
    ...preview,
    club: { id: club.id, name: club.name, shortName: club.shortName, leagueName },
    nextMatch: {
      ...preview.nextMatch,
      opponentName: opponentRow?.clubName ?? preview.nextMatch.opponentName,
      opponentPosition: opponentRow?.position ?? preview.nextMatch.opponentPosition,
      competition: leagueName,
    },
    table,
    squad: { ...preview.squad, playerCount: contracts.length },
    finances: {
      balance: club.finances.balance,
      transferBudget: club.finances.transferBudget,
      weeklyWageBill: contracts.reduce((sum, c) => sum + c.weeklyWage, 0),
      weeklyWageBudget: club.finances.weeklyWageBudget,
    },
  };
}
