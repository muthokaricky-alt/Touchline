import { isCup, isLeague, type ClubId, type CompetitionId, type GameDatabase, type League } from '@/data/schemas';
import { simulateShootout, type ShootoutPlayer } from '@/engine/penalties';
import { simulateMatch } from '@/engine/simulate';
import type { MatchInput, MatchResult, Side } from '@/engine/types';

import { aiSetup, buildAiTeam } from '../ai/opponent';
import type { Lineup } from '../lineup';
import { buildMatchTeam, lineupStrength } from '../match/build-match-team';
import { flattenAttributes } from '../ratings';
import { selectSquadCandidates } from '../squad/squad-selectors';
import type { Tactics } from '../tactics/tactics';
import { cupEntrants, cupRoundCount, cupRoundName, cupWinner, firstCupRound, nextCupRound } from './cup';
import { scheduleLeague } from './fixtures';
import { addMatchToStats } from './player-stats';
import { mixSeed, seasonLabel, type Fixture, type FixtureResult, type LeagueMembership, type Season } from './season';
import { computeTable, type TableRow } from './table';

/**
 * The season loop as pure functions, each returning a NEW Season.
 *
 * Play is ordered by DATE across all competitions (league Saturdays, cup
 * Wednesdays). Playing the user's next fixture first plays every earlier
 * date they're not involved in, then that whole date.
 *
 *   createSeason → advanceToUserFixture × n → playRemaining → startNextSeason
 */

export type UserTeam = { clubId: ClubId; lineup: Lineup; tactics: Tactics };

// --- Competitions this season ---------------------------------------------------

/** A league as configured in the database, with THIS season's clubs. */
export function leagueForSeason(db: GameDatabase, season: Season, competitionId: CompetitionId): League {
  const base = db.competitions.find((c) => c.id === competitionId);
  if (!base || !isLeague(base)) throw new RangeError(`Unknown league "${competitionId}"`);
  const membership = season.leagues.find((l) => l.competitionId === competitionId);
  return { ...base, clubIds: membership ? membership.clubIds : base.clubIds };
}

export function competitionName(db: GameDatabase, competitionId: CompetitionId): string {
  return db.competitions.find((c) => c.id === competitionId)?.name ?? competitionId;
}

/** The league a club plays in this season, or null. */
export function leagueOfClub(season: Season, clubId: ClubId): CompetitionId | null {
  return season.leagues.find((l) => l.clubIds.includes(clubId))?.competitionId ?? null;
}

/** Number of league matchdays (all leagues share the calendar; the longest decides). */
function leagueWeeks(season: Season): number {
  const leagueIds = new Set(season.leagues.map((l) => l.competitionId));
  return Math.max(0, ...season.fixtures.filter((f) => leagueIds.has(f.competitionId)).map((f) => f.matchday));
}

export function totalMatchdays(season: Season, competitionId: CompetitionId): number {
  return Math.max(0, ...season.fixtures.filter((f) => f.competitionId === competitionId).map((f) => f.matchday));
}

// --- Creating seasons ----------------------------------------------------------------

/**
 * A new season. Leagues come from `memberships` (after promotion/relegation)
 * or, for the first season, from the database. Leagues are ordered by tier.
 */
export function createSeason(db: GameDatabase, startYear: number, seed: number, memberships?: LeagueMembership[]): Season {
  const dbLeagues = db.competitions.filter(isLeague).sort((a, b) => a.tier - b.tier);
  const leagues = memberships ?? dbLeagues.map((l) => ({ competitionId: l.id, clubIds: [...l.clubIds] }));
  const cup = db.competitions.find(isCup) ?? null;

  const fixtures = leagues.flatMap((membership, index) => {
    const league = dbLeagues.find((l) => l.id === membership.competitionId);
    if (!league) throw new RangeError(`Unknown league "${membership.competitionId}"`);
    return scheduleLeague({
      competitionId: membership.competitionId,
      clubIds: membership.clubIds,
      roundsPerOpponent: league.rules.roundsPerOpponent,
      startYear,
      seed: mixSeed(seed, index),
    });
  });

  const season: Season = { label: seasonLabel(startYear), startYear, seed, leagues, cupId: cup?.id ?? null, fixtures, playerStats: [] };
  return { ...season, fixtures: [...fixtures, ...firstCupRound(season, leagueWeeks(season))] };
}

// --- Queries -----------------------------------------------------------------------

/** Earliest date with an unplayed fixture, or null when everything is played. */
export function nextDate(season: Season): string | null {
  let earliest: string | null = null;
  for (const f of season.fixtures) if (!f.result && (earliest === null || f.date < earliest)) earliest = f.date;
  return earliest;
}

/** Complete when every fixture is played (the cup's next round is always drawn as soon as possible). */
export const isSeasonComplete = (season: Season) => nextDate(season) === null;

const involves = (f: Fixture, clubId: ClubId) => f.homeId === clubId || f.awayId === clubId;

/** The club's next unplayed fixture in any competition (earliest date). */
export function nextFixtureFor(season: Season, clubId: ClubId): Fixture | null {
  let next: Fixture | null = null;
  for (const f of season.fixtures) {
    if (!f.result && involves(f, clubId) && (next === null || f.date < next.date)) next = f;
  }
  return next;
}

/** The lowest unplayed matchday of a league, or null when it's finished. */
export function currentMatchday(season: Season, competitionId: CompetitionId): number | null {
  const unplayed = season.fixtures.filter((f) => f.competitionId === competitionId && !f.result).map((f) => f.matchday);
  return unplayed.length ? Math.min(...unplayed) : null;
}

/**
 * Display labels for a fixture's round: "Matchday 3 of 38" for leagues,
 * "Quarter-finals" for the cup.
 */
export function roundLabel(season: Season, fixture: Fixture): string {
  if (fixture.competitionId === season.cupId) {
    const entrants = cupEntrants(season).length;
    return cupRoundName(fixture.matchday, cupRoundCount(entrants), entrants);
  }
  return `Matchday ${fixture.matchday} of ${totalMatchdays(season, fixture.competitionId)}`;
}

export function leagueTable(db: GameDatabase, season: Season, competitionId: CompetitionId): TableRow[] {
  return computeTable(season.fixtures, leagueForSeason(db, season, competitionId));
}

// --- Playing ----------------------------------------------------------------------

/** Per-fixture seed: season seed mixed with a hash of the fixture id. */
export function fixtureSeed(season: Season, fixture: Fixture): number {
  let h = season.seed >>> 0;
  for (let i = 0; i < fixture.id.length; i++) h = (Math.imul(h, 31) + fixture.id.charCodeAt(i)) >>> 0;
  return h % 2_147_483_647;
}

/** Engine input. The user's side uses their lineup/tactics; AI sides set up against their opponent's strength. */
export function buildFixtureInput(db: GameDatabase, season: Season, fixture: Fixture, user?: UserTeam): MatchInput {
  const isUser = (clubId: ClubId) => user !== undefined && clubId === user.clubId;
  const strengthOf = (clubId: ClubId) =>
    isUser(clubId) ? lineupStrength(user!.lineup, selectSquadCandidates(db, clubId)) : aiSetup(db, clubId).strength;
  const teamFor = (clubId: ClubId, opponentId: ClubId) =>
    isUser(clubId) ? buildMatchTeam(db, clubId, user!.lineup, user!.tactics) : buildAiTeam(db, clubId, strengthOf(opponentId));
  return { home: teamFor(fixture.homeId, fixture.awayId), away: teamFor(fixture.awayId, fixture.homeId), seed: fixtureSeed(season, fixture) };
}

/** Simulates a fixture; a level cup tie goes to penalties taken by the players who finished the match. */
export function simulateFixture(db: GameDatabase, season: Season, fixture: Fixture, user?: UserTeam): MatchResult {
  const input = buildFixtureInput(db, season, fixture, user);
  const result = simulateMatch(input);
  if (fixture.competitionId !== season.cupId || result.score.home !== result.score.away) return result;

  const finishers = (side: Side) => {
    const squad = new Map(input[side].squad.map((c) => [c.player.id, c]));
    const onPitch = result.players.filter((p) => p.side === side && !p.redCard && (!p.started || p.minutesPlayed === 90));
    const toShooter = (id: string): ShootoutPlayer | null => {
      const c = squad.get(id);
      return c ? { id, attrs: flattenAttributes(c.attributes) } : null;
    };
    const keeper = onPitch.find((p) => p.position === 'GK');
    const takers = onPitch.filter((p) => p.position !== 'GK').map((p) => toShooter(p.playerId)).filter((s): s is ShootoutPlayer => s !== null);
    return { takers, keeper: keeper ? toShooter(keeper.playerId) : null };
  };
  const home = finishers('home');
  const away = finishers('away');
  const shootout = simulateShootout({
    home: home.takers,
    away: away.takers,
    homeKeeper: home.keeper,
    awayKeeper: away.keeper,
    seed: mixSeed(input.seed, 77),
  });
  return { ...result, penalties: { home: shootout.home, away: shootout.away } };
}

/** Shrinks a full MatchResult to what a season stores. */
export function compactResult(result: MatchResult): FixtureResult {
  const at = (e: { minute: number; addedTime?: number }) => ({ minute: e.minute, ...(e.addedTime ? { addedTime: e.addedTime } : {}) });
  return {
    score: result.score,
    goals: result.events.flatMap((e) => (e.type === 'goal' ? [{ ...at(e), side: e.side, scorerId: e.scorerId, assistId: e.assistId }] : [])),
    cards: result.events.flatMap((e) => (e.type === 'card' ? [{ ...at(e), side: e.side, playerId: e.playerId, card: e.card }] : [])),
    playerOfTheMatch: result.playerOfTheMatch,
    ...(result.penalties ? { penalties: result.penalties } : {}),
  };
}

/** Stores a result and adds it to the player totals. */
export function recordResult(season: Season, fixtureId: string, result: MatchResult): Season {
  const fixture = season.fixtures.find((f) => f.id === fixtureId);
  if (!fixture) throw new RangeError(`Unknown fixture "${fixtureId}"`);
  if (fixture.result) throw new RangeError(`Fixture "${fixtureId}" has already been played`);
  return {
    ...season,
    fixtures: season.fixtures.map((f) => (f.id === fixtureId ? { ...f, result: compactResult(result) } : f)),
    playerStats: addMatchToStats(season.playerStats, fixture, result),
  };
}

/** Draws the next cup round if the previous one has just finished. */
function advanceCup(season: Season): Season {
  const drawn = nextCupRound(season, leagueWeeks(season));
  return drawn.length ? { ...season, fixtures: [...season.fixtures, ...drawn] } : season;
}

/**
 * Plays every unplayed fixture on `date`. The user's fixture (if any) uses
 * their team; its full result is returned for the match centre.
 */
export function playDate(
  db: GameDatabase,
  season: Season,
  date: string,
  user?: UserTeam,
): { season: Season; userMatch: { fixture: Fixture; result: MatchResult } | null } {
  let next = season;
  let userMatch: { fixture: Fixture; result: MatchResult } | null = null;
  for (const fixture of season.fixtures) {
    if (fixture.date !== date || fixture.result) continue;
    const mine = user !== undefined && involves(fixture, user.clubId);
    const result = simulateFixture(db, season, fixture, mine ? user : undefined);
    next = recordResult(next, fixture.id, result);
    if (mine) userMatch = { fixture, result };
  }
  return { season: advanceCup(next), userMatch };
}

/**
 * Plays everything up to and including the user's next fixture's date.
 * Earlier dates (e.g. cup rounds after the user was knocked out) are played
 * AI-only first.
 */
export function advanceToUserFixture(
  db: GameDatabase,
  season: Season,
  user: UserTeam,
): { season: Season; fixture: Fixture; result: MatchResult } {
  const target = nextFixtureFor(season, user.clubId);
  if (!target) throw new RangeError('No fixture left to play this season');
  let current = season;
  for (let date = nextDate(current); date !== null && date < target.date; date = nextDate(current)) {
    current = playDate(db, current, date).season;
  }
  const played = playDate(db, current, target.date, user);
  if (!played.userMatch) throw new Error(`Expected the user's fixture on ${target.date}`);
  return { season: played.season, fixture: played.userMatch.fixture, result: played.userMatch.result };
}

/** Plays every remaining date (used once the user has no fixtures left). */
export function playRemaining(db: GameDatabase, season: Season): Season {
  let current = season;
  for (let date = nextDate(current); date !== null; date = nextDate(current)) current = playDate(db, current, date).season;
  return current;
}

// --- End of season -----------------------------------------------------------------

export type LeagueOutcome = {
  competitionId: CompetitionId;
  tier: number;
  table: TableRow[];
  champion: ClubId;
  promoted: ClubId[];
  relegated: ClubId[];
};

export type SeasonOutcome = { leagues: LeagueOutcome[]; cupWinner: ClubId | null };

export function seasonOutcome(db: GameDatabase, season: Season): SeasonOutcome {
  return {
    leagues: season.leagues.map((m) => {
      const league = leagueForSeason(db, season, m.competitionId);
      const table = computeTable(season.fixtures, league);
      return {
        competitionId: m.competitionId,
        tier: league.tier,
        table,
        champion: table[0].clubId,
        promoted: table.filter((r) => r.zone === 'promotion').map((r) => r.clubId),
        relegated: table.filter((r) => r.zone === 'relegation').map((r) => r.clubId),
      };
    }),
    cupWinner: cupWinner(season),
  };
}

/**
 * Next season's league memberships: each tier's relegated clubs drop one
 * tier, the tier below's promoted clubs go up. Leagues keep their size as
 * long as the places match (3 down, 3 up).
 */
export function nextMemberships(db: GameDatabase, season: Season): LeagueMembership[] {
  const outcome = seasonOutcome(db, season).leagues.sort((a, b) => a.tier - b.tier);
  return outcome.map((league, i) => {
    const above = outcome[i - 1];
    const below = outcome[i + 1];
    const leaving = new Set([...(below ? league.relegated : []), ...(above ? league.promoted : [])]);
    const staying = league.table.map((r) => r.clubId).filter((id) => !leaving.has(id));
    const arriving = [...(above ? above.relegated : []), ...(below ? below.promoted : [])];
    return { competitionId: league.competitionId, clubIds: [...staying, ...arriving] };
  });
}

/** A new season one year on, with promotion/relegation applied and a fresh (derived) seed. */
export function startNextSeason(db: GameDatabase, season: Season): Season {
  if (!isSeasonComplete(season)) throw new RangeError('The current season is still in progress');
  return createSeason(db, season.startYear + 1, mixSeed(season.seed, 4242), nextMemberships(db, season));
}
