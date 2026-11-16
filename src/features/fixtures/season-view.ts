import type { ClubId, CompetitionId, GameDatabase } from '@/data/schemas';
import { countryName } from '@/data/fictional';
import { formatMatchDate } from '@/utils/format';
import {
  aggregateScore,
  GROUP_MATCHDAYS,
  groupName,
  groupStageComplete,
  groupTables,
  otherLeg,
  stageName,
  twoLegStage,
} from '@/game/season/continental';
import {
  cupEntrants,
  cupFixtures,
  cupGroups,
  cupRoundCount,
  cupRoundLabel,
  cupRoundName,
  cupWinner,
  decidedTieWinner,
  seasonCup,
} from '@/game/season/cup';
import { seasonPlayerStats, topAssists, topScorers, type PlayerSeasonStats } from '@/game/season/player-stats';
import type { Fixture, Season } from '@/game/season/season';
import { competitionName, currentMatchday, leagueOfClub, leagueTable, totalMatchdays } from '@/game/season/season-flow';
import type { TableRow } from '@/game/season/table';
import { fullName } from '@/game/squad/squad-selectors';

/** View models for the Fixtures tab: competition picker, league view, cup view. Pure. */

/** `group`: the country ("England") or "Continental": the Fixtures tab picks a group, then a competition in it. */
export type CompetitionOption = { id: CompetitionId; label: string; kind: 'league' | 'cup'; group: string };

/** Continental competitions' group on the Fixtures tab. */
export const CONTINENTAL_GROUP = 'Continental';

export type FixtureRowView = {
  id: string;
  homeName: string;
  awayName: string;
  score: { home: number; away: number } | null;
  penalties: { home: number; away: number } | null;
  /** Second legs: the score over both legs (this fixture's home side first). */
  aggregate?: { home: number; away: number } | null;
  /** Second legs not played yet: the first leg's score, this fixture's home side first. */
  firstLeg?: { home: number; away: number } | null;
  involvesUser: boolean;
  /** From the user's point of view, when played (cup ties: penalties decide). */
  userOutcome: 'W' | 'D' | 'L' | null;
};

export type MatchdayView = { matchday: number; date: string; isCurrent: boolean; fixtures: FixtureRowView[] };
export type TableRowView = TableRow & { clubName: string; shortName: string; isUser: boolean };
export type LeaderRowView = { playerId: string; name: string; clubShortName: string; value: number; appearances: number };

export type LeagueView = {
  kind: 'league';
  competitionName: string;
  currentMatchday: number | null;
  totalMatchdays: number;
  matchdays: MatchdayView[];
  table: TableRowView[];
  topScorers: LeaderRowView[];
  topAssists: LeaderRowView[];
};

export type CupRoundView = { round: number; name: string; date: string; ties: FixtureRowView[] };

export type CupView = {
  kind: 'cup';
  competitionName: string;
  rounds: CupRoundView[];
  /** A group stage (the Continental Cup): each group's table, top two marked as going through. */
  groups?: { name: string; rows: TableRowView[] }[];
  winnerName: string | null;
  /** e.g. "Through to the Quarter-finals", "Knocked out in the Round of 16", "Winners!" */
  userStatus: string;
  topScorers: LeaderRowView[];
};

/**
 * Grouped by country: the user's country first (their league first, then
 * the country's other leagues, then its cup), the Continental Cup, then the
 * other countries in season order. Each option names its group, so the
 * screen can show a short row of groups and the chosen group's
 * competitions (16 chips in one list filled a third of a phone screen).
 */
export function competitionOptions(db: GameDatabase, season: Season, userClubId: ClubId): CompetitionOption[] {
  const userLeague = leagueOfClub(season, userClubId);
  const competition = (id: CompetitionId) => db.competitions.find((c) => c.id === id);
  const homeCountry = userLeague ? competition(userLeague)?.country : undefined;
  const leagues = [...season.leagues].sort((a, b) => Number(b.competitionId === userLeague) - Number(a.competitionId === userLeague));
  const countries = [...new Set([homeCountry, ...leagues.map((l) => competition(l.competitionId)?.country)])].filter(
    (c): c is string => c !== undefined,
  );

  // Cups that belong to no country (the Continental Cup) come right after the user's country.
  const international = season.cups
    .filter((cup) => !countries.includes(competition(cup.competitionId)?.country ?? ''))
    .map((cup) => ({ id: cup.competitionId, label: competitionName(db, cup.competitionId), kind: 'cup' as const, group: CONTINENTAL_GROUP }));
  return countries.flatMap((country, index) => {
    const group = countryName(country);
    return [
      ...leagues
        .filter((l) => competition(l.competitionId)?.country === country)
        .map((l) => ({ id: l.competitionId, label: competitionName(db, l.competitionId), kind: 'league' as const, group })),
      ...season.cups
        .filter((cup) => competition(cup.competitionId)?.country === country)
        .map((cup) => ({ id: cup.competitionId, label: competitionName(db, cup.competitionId), kind: 'cup' as const, group })),
      ...(index === 0 ? international : []),
    ];
  });
}

/** The groups in order of first appearance (the user's country first). */
export function competitionGroups(options: readonly CompetitionOption[]): string[] {
  return [...new Set(options.map((o) => o.group))];
}

/**
 * `decided`: for a match that decides a cup tie, who went through (the
 * user's outcome is then W or L, penalties and aggregates included). Other
 * matches (league, cup group matches, first legs) show W, D or L by score.
 */
function rowView(db: GameDatabase, f: Fixture, userClubId: ClubId, decided: ClubId | null = null): FixtureRowView {
  const nameOf = (id: ClubId) => db.clubs.find((c) => c.id === id)?.name ?? id;
  const involvesUser = f.homeId === userClubId || f.awayId === userClubId;
  let userOutcome: FixtureRowView['userOutcome'] = null;
  if (f.result && involvesUser) {
    if (decided) userOutcome = decided === userClubId ? 'W' : 'L';
    else {
      const { home, away } = f.result.score;
      const [mine, theirs] = f.homeId === userClubId ? [home, away] : [away, home];
      userOutcome = mine > theirs ? 'W' : mine === theirs ? 'D' : 'L';
    }
  }
  return {
    id: f.id,
    homeName: nameOf(f.homeId),
    awayName: nameOf(f.awayId),
    score: f.result?.score ?? null,
    penalties: f.result?.penalties ?? null,
    involvesUser,
    userOutcome,
  };
}

function leaders(db: GameDatabase, rows: PlayerSeasonStats[], value: (s: PlayerSeasonStats) => number): LeaderRowView[] {
  const clubs = new Map(db.clubs.map((c) => [c.id, c]));
  const players = new Map(db.players.map((p) => [p.id, p]));
  return rows.map((s) => {
    const player = players.get(s.playerId);
    return {
      playerId: s.playerId,
      name: player ? fullName(player) : s.playerId,
      clubShortName: clubs.get(s.clubId)?.shortName ?? '',
      value: value(s),
      appearances: s.appearances,
    };
  });
}

export function buildLeagueView(db: GameDatabase, season: Season, competitionId: CompetitionId, userClubId: ClubId): LeagueView {
  const clubs = new Map(db.clubs.map((c) => [c.id, c]));
  const current = currentMatchday(season, competitionId);
  const byMatchday = new Map<number, MatchdayView>();
  for (const f of season.fixtures.filter((x) => x.competitionId === competitionId).sort((a, b) => a.matchday - b.matchday)) {
    const day = byMatchday.get(f.matchday) ?? { matchday: f.matchday, date: f.date, isCurrent: f.matchday === current, fixtures: [] };
    day.fixtures.push(rowView(db, f, userClubId));
    byMatchday.set(f.matchday, day);
  }
  const stats = seasonPlayerStats(season, competitionId);
  return {
    kind: 'league',
    competitionName: competitionName(db, competitionId),
    currentMatchday: current,
    totalMatchdays: totalMatchdays(season, competitionId),
    matchdays: [...byMatchday.values()],
    table: leagueTable(db, season, competitionId).map((row) => ({
      ...row,
      clubName: clubs.get(row.clubId)?.name ?? row.clubId,
      shortName: clubs.get(row.clubId)?.shortName ?? '',
      isUser: row.clubId === userClubId,
    })),
    topScorers: leaders(db, topScorers(stats), (s) => s.goals),
    topAssists: leaders(db, topAssists(stats), (s) => s.assists),
  };
}

export function buildCupView(db: GameDatabase, season: Season, cupId: CompetitionId, userClubId: ClubId): CupView | null {
  if (!seasonCup(season, cupId)) return null;
  const fixtures = cupFixtures(season, cupId);
  const entrants = cupEntrants(season, cupId);
  const groups = cupGroups(season, cupId);
  const clubs = new Map(db.clubs.map((c) => [c.id, c]));
  const label = (round: number) => cupRoundLabel(season, cupId, round);

  // With a group stage, only the current group matchday is listed (all 12 matches); knockout rounds always.
  const groupDays = groups ? fixtures.filter((f) => f.matchday <= GROUP_MATCHDAYS) : [];
  const unplayedGroupDays = groupDays.filter((f) => !f.result).map((f) => f.matchday);
  const currentGroupDay = unplayedGroupDays.length ? Math.min(...unplayedGroupDays) : GROUP_MATCHDAYS;
  const shown = groups ? fixtures.filter((f) => f.matchday > GROUP_MATCHDAYS || f.matchday === currentGroupDay) : fixtures;
  const rounds: CupRoundView[] = [];
  for (const f of [...shown].sort((a, b) => a.matchday - b.matchday)) {
    let round = rounds.find((r) => r.round === f.matchday);
    if (!round) {
      round = { round: f.matchday, name: label(f.matchday), date: f.date, ties: [] };
      rounds.push(round);
    }
    const row = rowView(db, f, userClubId, decidedTieWinner(season, f));
    const leg = groups && seasonCup(season, cupId)?.twoLegged ? twoLegStage(f.matchday) : null;
    if (leg?.leg === 2 && f.result) row.aggregate = aggregateScore(otherLeg(fixtures, f), f.result.score);
    if (leg?.leg === 2 && !f.result) {
      // The first leg was the other way round: its away side is this row's home side.
      const first = otherLeg(fixtures, f)?.result?.score;
      if (first) row.firstLeg = { home: first.away, away: first.home };
    }
    round.ties.push(row);
  }

  const tables = groups ? groupTables(season, cupId, groups) : null;
  const groupViews = tables?.map((rows, g) => ({
    name: groupName(g),
    rows: rows.map((row) => ({
      ...row,
      // The top two always go through (the bar); four of the six thirds do too.
      zone: row.position <= 2 ? ('promotion' as const) : null,
      clubName: clubs.get(row.clubId)?.name ?? row.clubId,
      shortName: clubs.get(row.clubId)?.shortName ?? '',
      isUser: row.clubId === userClubId,
    })),
  }));

  const winner = cupWinner(season, cupId);
  const nameOf = (id: ClubId) => db.clubs.find((c) => c.id === id)?.name ?? id;
  const knockoutTies = fixtures.filter((f) => !groups || f.matchday > GROUP_MATCHDAYS);
  const userTies = knockoutTies.filter((f) => f.homeId === userClubId || f.awayId === userClubId).sort((a, b) => a.matchday - b.matchday);
  const lastTie = userTies.at(-1);
  const firstKnockout = groups ? GROUP_MATCHDAYS + 1 : 1;
  const twoLegged = Boolean(groups && seasonCup(season, cupId)?.twoLegged);
  // Two-legged: statuses name the stage ("Round of 16"), not the leg.
  const tieName = (round: number) => (twoLegged ? stageName(twoLegStage(round)?.stage ?? 0) : label(round));
  const lastDecided = lastTie ? decidedTieWinner(season, lastTie) : null;
  let userStatus: string;
  if (winner === userClubId) userStatus = 'Winners!';
  else if (!entrants.includes(userClubId)) userStatus = 'Not entered';
  else if (lastTie && (!lastTie.result || (twoLegged && twoLegStage(lastTie.matchday)?.leg === 1)))
    userStatus = `In the ${tieName(lastTie.matchday)}`;
  else if (lastTie && lastDecided !== userClubId) userStatus = `Knocked out in the ${tieName(lastTie.matchday)}`;
  else if (lastTie) userStatus = `Through to the ${tieName(lastTie.matchday + 1)}`;
  else if (tables) {
    const g = tables.findIndex((rows) => rows.some((r) => r.clubId === userClubId));
    const row = tables[g].find((r) => r.clubId === userClubId)!;
    const firstMatch = groupDays.filter((f) => f.homeId === userClubId || f.awayId === userClubId).sort((a, b) => a.matchday - b.matchday)[0];
    userStatus = groupStageComplete(season, cupId)
      ? 'Out in the group stage'
      : row.played === 0 && firstMatch
        ? `${groupName(g)}: first match ${formatMatchDate(firstMatch.date)}`
        : `${groupName(g)}: ${ordinal(row.position)} after ${row.played} ${row.played === 1 ? 'game' : 'games'}`;
  } else userStatus = `Bye to the ${cupRoundName(firstKnockout + 1, cupRoundCount(entrants.length), entrants.length)}`;

  return {
    kind: 'cup',
    competitionName: competitionName(db, cupId),
    rounds,
    ...(groupViews ? { groups: groupViews } : {}),
    winnerName: winner ? nameOf(winner) : null,
    userStatus,
    topScorers: leaders(db, topScorers(seasonPlayerStats(season, cupId)), (s) => s.goals),
  };
}

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
