import type { ClubId, GameDatabase } from '@/data/schemas';
import { conditionOf, type ConditionState } from '@/game/condition/condition';
import { suspendedFor } from '@/game/discipline/suspensions';
import { unreadCount, type InboxMessage as GameMessage } from '@/game/inbox/inbox';
import { cupWinner, firstLegOf, isCupFixture } from '@/game/season/cup';
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
import { formatDate, formatMatchDate } from '@/utils/format';

import type { DashboardSummary } from './dashboard.types';

/** How many of the latest messages the dashboard shows. */
export const INBOX_PREVIEW = 4;

/**
 * Builds the dashboard from game state.
 *
 * Real: club, season, date, matchday, next fixture (league or cup), form,
 *       league table, squad size, finances, end-of-season summary, inbox,
 *       fitness, morale, injuries (when `condition` is given), suspensions
 *       for the next fixture.
 * Preview: kick-off time.
 */
export function buildDashboardSummary(
  db: GameDatabase,
  clubId: ClubId,
  season: Season,
  currentDate: string,
  inbox: readonly GameMessage[],
  preview: DashboardSummary,
  condition?: ConditionState,
): DashboardSummary {
  const club = db.clubs.find((c) => c.id === clubId);
  const leagueId = leagueOfClub(season, clubId);
  if (!club || !leagueId) return preview;
  const nameOf = (id: ClubId) => db.clubs.find((c) => c.id === id)?.name ?? id;
  const leagueName = competitionName(db, leagueId);

  const table = leagueTable(db, season, leagueId);
  const userRow = table.find((r) => r.clubId === clubId);
  const total = totalMatchdays(season, leagueId);

  const fixture = nextFixtureFor(season, clubId);
  const nextMatch = fixture
    ? (() => {
        const venue = fixture.homeId === clubId ? ('home' as const) : ('away' as const);
        const opponentId = venue === 'home' ? fixture.awayId : fixture.homeId;
        // A cup opponent from another league is placed in its own league's table.
        const opponentLeague = leagueOfClub(season, opponentId);
        const otherLeague = opponentLeague !== null && opponentLeague !== leagueId;
        const opponentTable = otherLeague ? leagueTable(db, season, opponentLeague) : table;
        const opponentRow = opponentTable.find((r) => r.clubId === opponentId);
        const isCup = isCupFixture(season, fixture);
        const firstLeg = firstLegOf(season, fixture);
        return {
          opponentId,
          opponentName: nameOf(opponentId),
          venue,
          competition: isCup ? `${competitionName(db, fixture.competitionId)} · ${roundLabel(season, fixture)}` : leagueName,
          date: formatMatchDate(fixture.date),
          kickOff: isCup ? '19:45' : (preview.nextMatch?.kickOff ?? '15:00'),
          opponentPosition: opponentRow && opponentRow.played > 0 ? opponentRow.position : null,
          opponentLeagueName: otherLeague ? competitionName(db, opponentLeague) : null,
          opponentForm: opponentRow?.form ?? [],
          firstLeg: firstLeg?.result
            ? `First leg: ${nameOf(firstLeg.homeId)} ${firstLeg.result.score.home}–${firstLeg.result.score.away} ${nameOf(firstLeg.awayId)}`
            : null,
        };
      })()
    : null;

  const complete = isSeasonComplete(season);
  // The season summary names the winner of the user's country's cup.
  const country = db.competitions.find((c) => c.id === leagueId)?.country;
  const homeCup = season.cups.find((cup) => db.competitions.find((c) => c.id === cup.competitionId)?.country === country);
  const winner = homeCup ? cupWinner(season, homeCup.competitionId) : null;
  const continental = season.cups.find((cup) => db.competitions.find((c) => c.id === cup.competitionId)?.country === 'INT');
  const continentalWinner = continental ? cupWinner(season, continental.competitionId) : null;
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
            cupName: homeCup ? competitionName(db, homeCup.competitionId) : null,
            cupWinnerName: winner ? nameOf(winner) : null,
            continentalWinnerName: continentalWinner ? nameOf(continentalWinner) : null,
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
    squad: (() => {
      if (!condition || contracts.length === 0) return { ...preview.squad, playerCount: contracts.length };
      const conditions = contracts.map((c) => conditionOf(condition, c.playerId));
      const average = (pick: (c: (typeof conditions)[number]) => number) => conditions.reduce((sum, c) => sum + pick(c), 0) / conditions.length / 100;
      return {
        playerCount: contracts.length,
        averageFitness: average((c) => c.fitness),
        averageMorale: average((c) => c.morale),
        injuredCount: conditions.filter((c) => c.injury !== null).length,
        suspendedCount: (() => {
          const banned = suspendedFor(season, fixture);
          return contracts.filter((c) => banned.has(c.playerId)).length;
        })(),
      };
    })(),
    inbox: inbox.slice(0, INBOX_PREVIEW).map((m) => ({ id: m.id, from: m.from, subject: m.title, date: formatDate(m.date), unread: !m.read })),
    unreadMessages: unreadCount(inbox),
    finances: {
      balance: club.finances.balance,
      transferBudget: club.finances.transferBudget,
      weeklyWageBill: contracts.reduce((sum, c) => sum + c.weeklyWage, 0),
      weeklyWageBudget: club.finances.weeklyWageBudget,
    },
  };
}
