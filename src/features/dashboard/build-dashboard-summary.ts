import type { ClubId, GameDatabase } from '@/data/schemas';
import type { Season } from '@/game/season/season';
import { currentMatchday, findLeague, nextFixtureFor, totalMatchdays } from '@/game/season/season-flow';
import { computeTable } from '@/game/season/table';
import { formatMatchDate } from '@/utils/format';

import type { DashboardSummary } from './dashboard.types';

/**
 * Builds the dashboard from game state.
 *
 * Real: club, season label, date, matchday, next fixture, form, league table,
 *       squad size, finances, end-of-season summary.
 * Preview (until later milestones): manager name, kick-off time, fitness,
 *       morale, injuries/suspensions, inbox.
 */
export function buildDashboardSummary(
  db: GameDatabase,
  clubId: ClubId,
  season: Season,
  currentDate: string,
  preview: DashboardSummary,
): DashboardSummary {
  const club = db.clubs.find((c) => c.id === clubId);
  if (!club) return preview;
  const league = findLeague(db, season.competitionId);
  const nameOf = (id: ClubId) => db.clubs.find((c) => c.id === id)?.name ?? id;

  const table = computeTable(season.fixtures, league);
  const userRow = table.find((r) => r.clubId === clubId);
  const anyPlayed = table.some((r) => r.played > 0);
  const total = totalMatchdays(season);
  const matchday = currentMatchday(season);

  const fixture = nextFixtureFor(season, clubId);
  const nextMatch = fixture
    ? (() => {
        const venue = fixture.homeId === clubId ? ('home' as const) : ('away' as const);
        const opponentId = venue === 'home' ? fixture.awayId : fixture.homeId;
        const opponentRow = table.find((r) => r.clubId === opponentId);
        return {
          opponentId,
          opponentName: nameOf(opponentId),
          venue,
          competition: league.name,
          date: formatMatchDate(fixture.date),
          kickOff: preview.nextMatch?.kickOff ?? '15:00',
          opponentPosition: anyPlayed ? (opponentRow?.position ?? null) : null,
          opponentForm: opponentRow?.form ?? [],
        };
      })()
    : null;

  const contracts = db.contracts.filter((c) => c.clubId === clubId);

  return {
    ...preview,
    club: { id: club.id, name: club.name, shortName: club.shortName, leagueName: league.name },
    season: {
      label: season.label,
      currentDate: formatMatchDate(currentDate, true),
      matchday: matchday ?? total,
      totalMatchdays: total,
    },
    nextMatch,
    seasonEnd:
      matchday === null && userRow
        ? { championName: nameOf(table[0].clubId), userPosition: userRow.position, userZone: userRow.zone }
        : null,
    form: userRow?.form ?? [],
    table: table.map((r) => ({
      position: r.position,
      clubId: r.clubId,
      clubName: nameOf(r.clubId),
      played: r.played,
      goalDifference: r.goalDifference,
      points: r.points,
    })),
    squad: { ...preview.squad, playerCount: contracts.length },
    finances: {
      balance: club.finances.balance,
      transferBudget: club.finances.transferBudget,
      weeklyWageBill: contracts.reduce((sum, c) => sum + c.weeklyWage, 0),
      weeklyWageBudget: club.finances.weeklyWageBudget,
    },
  };
}
