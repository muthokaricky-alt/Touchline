import type { ClubId, CompetitionId, GameDatabase } from '@/data/schemas';
import { cupEntrants, cupFixtures, cupRoundCount, cupRoundName, cupWinner, seasonCup, tieLoser, tieWinner } from '@/game/season/cup';
import { seasonPlayerStats, topAssists, topScorers, type PlayerSeasonStats } from '@/game/season/player-stats';
import type { Fixture, Season } from '@/game/season/season';
import { competitionName, currentMatchday, leagueOfClub, leagueTable, totalMatchdays } from '@/game/season/season-flow';
import type { TableRow } from '@/game/season/table';
import { fullName } from '@/game/squad/squad-selectors';

/** View models for the Fixtures tab: competition picker, league view, cup view. Pure. */

export type CompetitionOption = { id: CompetitionId; label: string; kind: 'league' | 'cup' };

export type FixtureRowView = {
  id: string;
  homeName: string;
  awayName: string;
  score: { home: number; away: number } | null;
  penalties: { home: number; away: number } | null;
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
  winnerName: string | null;
  /** e.g. "Through to the Quarter-finals", "Knocked out in the Round of 16", "Winners!" */
  userStatus: string;
  topScorers: LeaderRowView[];
};

/**
 * Grouped by country: the user's country first (their league first, then
 * the country's other leagues, then its cup), then the other countries in
 * season order. Other countries' leagues are labelled by their short name
 * ("Kenya", "First Div"), so the chips fit on a phone.
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
    .map((cup) => ({ id: cup.competitionId, label: competitionName(db, cup.competitionId), kind: 'cup' as const }));
  return countries.flatMap((country, index) => {
    const label = (id: CompetitionId) => (country === homeCountry ? competitionName(db, id) : (competition(id)?.shortName ?? competitionName(db, id)));
    return [
      ...leagues
        .filter((l) => competition(l.competitionId)?.country === country)
        .map((l) => ({ id: l.competitionId, label: label(l.competitionId), kind: 'league' as const })),
      ...season.cups
        .filter((cup) => competition(cup.competitionId)?.country === country)
        .map((cup) => ({ id: cup.competitionId, label: competitionName(db, cup.competitionId), kind: 'cup' as const })),
      ...(index === 0 ? international : []),
    ];
  });
}

function rowView(db: GameDatabase, f: Fixture, userClubId: ClubId, isCup: boolean): FixtureRowView {
  const nameOf = (id: ClubId) => db.clubs.find((c) => c.id === id)?.name ?? id;
  const involvesUser = f.homeId === userClubId || f.awayId === userClubId;
  let userOutcome: FixtureRowView['userOutcome'] = null;
  if (f.result && involvesUser) {
    if (isCup) userOutcome = tieWinner(f) === userClubId ? 'W' : 'L';
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
    day.fixtures.push(rowView(db, f, userClubId, false));
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
  const total = cupRoundCount(entrants.length);
  const rounds: CupRoundView[] = [];
  for (const f of [...fixtures].sort((a, b) => a.matchday - b.matchday)) {
    let round = rounds.find((r) => r.round === f.matchday);
    if (!round) {
      round = { round: f.matchday, name: cupRoundName(f.matchday, total, entrants.length), date: f.date, ties: [] };
      rounds.push(round);
    }
    round.ties.push(rowView(db, f, userClubId, true));
  }

  const winner = cupWinner(season, cupId);
  const nameOf = (id: ClubId) => db.clubs.find((c) => c.id === id)?.name ?? id;
  const userTies = fixtures.filter((f) => f.homeId === userClubId || f.awayId === userClubId).sort((a, b) => a.matchday - b.matchday);
  const lastTie = userTies.at(-1);
  let userStatus: string;
  if (winner === userClubId) userStatus = 'Winners!';
  else if (!lastTie) userStatus = entrants.includes(userClubId) ? `Bye to the ${cupRoundName(2, total, entrants.length)}` : 'Not entered';
  else if (!lastTie.result) userStatus = `In the ${cupRoundName(lastTie.matchday, total, entrants.length)}`;
  else if (tieLoser(lastTie) === userClubId) userStatus = `Knocked out in the ${cupRoundName(lastTie.matchday, total, entrants.length)}`;
  else userStatus = `Through to the ${cupRoundName(lastTie.matchday + 1, total, entrants.length)}`;

  return {
    kind: 'cup',
    competitionName: competitionName(db, cupId),
    rounds,
    winnerName: winner ? nameOf(winner) : null,
    userStatus,
    topScorers: leaders(db, topScorers(seasonPlayerStats(season, cupId)), (s) => s.goals),
  };
}
