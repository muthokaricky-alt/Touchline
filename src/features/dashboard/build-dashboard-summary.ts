import type { ClubId, GameDatabase } from '@/data/schemas';
import { cupWinner } from '@/game/season/cup';
import type { Season } from '@/game/season/season';
import {
  competitionName,
  currentMatchday,
  isSeasonComplete,
  leagueOfClub,
  leagueTable,
  nextFixtureFor,
  roundLabel,
  totalMatchdays,
} from '@/game/season/season-flow';
import { formatMatchDate } from '@/utils/format';

import type { DashboardSummary } from './dashboard.types';

/**
 * Builds the dashboard from game state.
 *
 * Real: club, season, date, matchday, next fixture (league or cup), form,
 *       league table, squad size, finances, end-of-season summary.
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
  const leagueId = leagueOfClub(season, clubId);
  if (!club || !leagueId) return preview;
  const nameOf = (id: ClubId) => db.clubs.find((c) => c.id === id)?.name ?? id;
  const leagueName = competitionName(db, leagueId);

  const table = leagueTable(db, season, leagueId);
  const userRow = table.find((r) => r.clubId === clubId);
  const anyPlayed = table.some((r) => r.played > 0);
  const total = totalMatchdays(season, leagueId);

  const fixture = nextFixtureFor(season, clubId);
  const nextMatch = fixture
    ? (() => {
        const venue = fixture.homeId === clubId ? ('home' as const) : ('away' as const);
        const opponentId = venue === 'home' ? fixture.awayId : fixture.homeId;
        const opponentRow = table.find((r) => r.clubId === opponentId); // undefined for a cup opponent from another league
        const isCup = fixture.competitionId === season.cupId;
        return {
          opponentId,
          opponentName: nameOf(opponentId),
          venue,
          competition: isCup ? `${competitionName(db, fixture.competitionId)} · ${roundLabel(season, fixture)}` : leagueName,
          date: formatMatchDate(fixture.date),
          kickOff: isCup ? '19:45' : (preview.nextMatch?.kickOff ?? '15:00'),
          opponentPosition: anyPlayed && opponentRow ? opponentRow.position : null,
          opponentForm: opponentRow?.form ?? [],
        };
      })()
    : null;

  const complete = isSeasonComplete(season);
  const winner = cupWinner(season);
  const contracts = db.contracts.filter((c) => c.clubId === clubId);

  return {
    ...preview,
    club: { id: club.id, name: club.name, shortName: club.shortName, leagueName },
    season: {
      label: season.label,
      currentDate: formatMatchDate(currentDate, true),
      matchday: currentMatchday(season, leagueId) ?? total,
      totalMatchdays: total,
    },
    nextMatch,
    awaitingSeasonEnd: !nextMatch && !complete,
    seasonEnd:
      complete && userRow
        ? {
            leagueName,
            championName: nameOf(table[0].clubId),
            userPosition: userRow.position,
            userZone: userRow.zone,
            cupName: season.cupId ? competitionName(db, season.cupId) : null,
            cupWinnerName: winner ? nameOf(winner) : null,
          }
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
