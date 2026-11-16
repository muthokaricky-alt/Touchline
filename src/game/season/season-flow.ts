import { isCup, isLeague, type ClubId, type CompetitionId, type GameDatabase, type League } from '@/data/schemas';
import { simulateShootout, type ShootoutPlayer } from '@/engine/penalties';
import { simulateMatch } from '@/engine/simulate';
import type { MatchChange, MatchInput, MatchResult, Side } from '@/engine/types';
import { addDays } from '@/utils/date';

import { aiSetup, buildAiTeam } from '../ai/opponent';
import { suspendedFor } from '../discipline/suspensions';
import { applyMatches, conditionOn, emptyConditions, squadIds, type ConditionState, type NewInjury } from '../condition/condition';
import { starterIds, type Lineup } from '../lineup';
import { buildMatchTeam, lineupStrength } from '../match/build-match-team';
import { flattenAttributes } from '../ratings';
import { selectSquadCandidates } from '../squad/squad-selectors';
import type { Tactics } from '../tactics/tactics';
import { drawGroups } from './continental';
import { cupRoundLabel, cupWinner, firstCupRound, isCupFixture, needsPenalties, nextCupRound } from './cup';
import { scheduleLeague, seasonStartDate } from './fixtures';
import { addMatchesToStats } from './player-stats';
import { mixSeed, seasonLabel, type Fixture, type FixtureResult, type LeagueMembership, type Season, type SeasonCup } from './season';
import { computeTable, type TableRow } from './table';

/**
 * The season loop as pure functions, each returning a NEW Season.
 *
 * Play is ordered by DATE across all competitions (league Saturdays, cup
 * Wednesdays). Playing the user's next fixture first plays every earlier
 * date they're not involved in, then that whole date.
 *
 *   createSeason → advanceToUserFixture × n → playRemaining → startNextSeason
 *
 * Players' condition (fitness, morale, injuries) is threaded through play:
 * pass the current ConditionState and get the updated one back. Omitting it
 * starts everyone fully fit on the first date played.
 */

/** The user's side of a fixture; `changes` are their in-match decisions (sides as in the fixture). */
export type UserTeam = { clubId: ClubId; lineup: Lineup; tactics: Tactics; changes?: readonly MatchChange[] };

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

export function totalMatchdays(season: Season, competitionId: CompetitionId): number {
  return Math.max(0, ...season.fixtures.filter((f) => f.competitionId === competitionId).map((f) => f.matchday));
}

// --- Creating seasons ----------------------------------------------------------------

/**
 * The database's leagues in season order: the cup's country first, by tier
 * (England's two divisions, so their fixture seeds are what they always
 * were), then the leagues abroad in database order.
 */
function seasonLeagueOrder(db: GameDatabase): League[] {
  const cupCountry = db.competitions.find(isCup)?.country;
  return db.competitions
    .filter(isLeague)
    .map((league, order) => ({ league, order }))
    .sort(
      (a, b) =>
        Number(b.league.country === cupCountry) - Number(a.league.country === cupCountry) || a.league.tier - b.league.tier || a.order - b.order,
    )
    .map((x) => x.league);
}

// --- The Continental Cup ----------------------------------------------------------

/** Clubs each country's top division sends. */
export const CONTINENTAL_PLACES = 4;
/**
 * Weeks (counted from the season's first Saturday) of the Continental Cup's
 * Tuesday rounds: six group matchdays, then both legs of the Round of 16,
 * quarter-finals and semi-finals. None is a week with a national-cup round (those are
 * Wednesdays in weeks 3, 10, 11, 18, 20, 25, 28 and 32), so no club plays
 * two cup ties in a week. The final is the Saturday after the National Cup final.
 */
const CONTINENTAL_WEEKS = [4, 6, 8, 13, 15, 17, 21, 23, 24, 26, 29, 31];
/** Groups of four: 24 entrants → 6 groups. */
const CONTINENTAL_GROUP_SIZE = 4;

const reputationOf = (db: GameDatabase, id: ClubId) => db.clubs.find((c) => c.id === id)?.reputation ?? 0;

/**
 * The Continental Cup for a new season: the top CONTINENTAL_PLACES of every
 * country's top division, by last season's table (by club reputation in the
 * first season). Entrants are listed strongest first, which decides the byes:
 * champions (league order), then runners-up by reputation, then thirds, fourths.
 */
function continentalCup(db: GameDatabase, leagues: readonly League[], startYear: number, seed: number, previous?: Season): SeasonCup | null {
  const cup = db.competitions.find((c) => isCup(c) && c.country === 'INT');
  const tops = leagues.filter((l) => l.tier === 1);
  if (!cup || tops.length < 2) return null;
  const byReputation = (ids: readonly ClubId[]) =>
    [...ids].sort((a, b) => reputationOf(db, b) - reputationOf(db, a) || a.localeCompare(b));
  const ranked = tops.map((league) => {
    const played = previous?.leagues.some((l) => l.competitionId === league.id) && previous.fixtures.some((f) => f.competitionId === league.id && f.result);
    return played
      ? computeTable(previous!.fixtures, leagueForSeason(db, previous!, league.id)).map((r) => r.clubId)
      : byReputation(league.clubIds);
  });
  const entrants = Array.from({ length: CONTINENTAL_PLACES }, (_, place) => {
    const atPlace = ranked.map((clubs) => clubs[place]).filter((id): id is ClubId => id !== undefined);
    return place === 0 ? atPlace : byReputation(atPlace);
  }).flat();

  const start = seasonStartDate(startYear);
  const lastLeagueWeek = Math.max(...leagues.map((l) => (l.clubIds.length - 1) * l.rules.roundsPerOpponent));
  const tuesdays = CONTINENTAL_WEEKS.map((week) => addDays(start, (week - 1) * 7 + 3));
  const final = addDays(start, (lastLeagueWeek + 1) * 7); // the Saturday after the National Cup final
  const countryOf = (id: ClubId) => db.clubs.find((c) => c.id === id)?.country ?? '';
  const groupCount = Math.floor(entrants.length / CONTINENTAL_GROUP_SIZE);
  return {
    competitionId: cup.id,
    entrantLeagues: tops.map((l) => l.id),
    entrants,
    roundDates: [...tuesdays, final],
    groups: drawGroups(entrants, countryOf, groupCount, seed),
    twoLegged: true,
  };
}

/**
 * A new season. Leagues come from `memberships` (after promotion/relegation)
 * or, for the first season, from the database; a league the memberships
 * don't mention (a save from before it existed) starts with its database clubs.
 * `previous` (the finished season) decides who plays in the Continental Cup.
 */
export function createSeason(db: GameDatabase, startYear: number, seed: number, memberships?: LeagueMembership[], previous?: Season): Season {
  const dbLeagues = seasonLeagueOrder(db);
  const leagues = dbLeagues.map(
    (l) => memberships?.find((m) => m.competitionId === l.id) ?? { competitionId: l.id, clubIds: [...l.clubIds] },
  );
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

  // One cup per country that has one, in league order (so the National Cup comes first), for that country's leagues.
  const countries = [...new Set(dbLeagues.map((l) => l.country))];
  const cups = db.competitions
    .filter(isCup)
    .filter((cup) => countries.includes(cup.country))
    .sort((a, b) => countries.indexOf(a.country) - countries.indexOf(b.country))
    .map((cup): SeasonCup => ({ competitionId: cup.id, entrantLeagues: dbLeagues.filter((l) => l.country === cup.country).map((l) => l.id) }));
  const leaguesThisSeason = dbLeagues.map((l) => ({ ...l, clubIds: leagues.find((m) => m.competitionId === l.id)!.clubIds }));
  // Its draws use the seed the cup code derives for the cup at this position (see cupSeed in cup.ts).
  const continental = continentalCup(db, leaguesThisSeason, startYear, mixSeed(seed, 5000 + cups.length), previous);
  if (continental) cups.push(continental);
  const season: Season = { label: seasonLabel(startYear), startYear, seed, leagues, cups, fixtures, playerStats: [] };
  return { ...season, fixtures: [...fixtures, ...cups.flatMap((cup) => firstCupRound(season, cup.competitionId))] };
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
  if (isCupFixture(season, fixture)) return cupRoundLabel(season, fixture.competitionId, fixture.matchday);
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

/**
 * Engine input. The user's side uses their lineup/tactics; AI sides set up against their opponent's
 * strength, without their suspended players. A user lineup with a suspended player is refused
 * (the UI blocks it too, but the game rules don't trust the UI).
 */
export function buildFixtureInput(db: GameDatabase, season: Season, fixture: Fixture, user?: UserTeam, condition?: ConditionState): MatchInput {
  const isUser = (clubId: ClubId) => user !== undefined && clubId === user.clubId;
  const suspended = suspendedFor(season, fixture);
  if (user && (isUser(fixture.homeId) || isUser(fixture.awayId))) {
    const banned = [...starterIds(user.lineup), ...user.lineup.substitutes].find((id) => suspended.has(id));
    if (banned) {
      const p = db.players.find((x) => x.id === banned);
      throw new RangeError(`${p ? `${p.firstName} ${p.lastName}` : banned} is suspended for this match`);
    }
  }
  const strengthOf = (clubId: ClubId) =>
    isUser(clubId) ? lineupStrength(user!.lineup, selectSquadCandidates(db, clubId)) : aiSetup(db, clubId).strength;
  const teamFor = (clubId: ClubId, opponentId: ClubId) =>
    isUser(clubId)
      ? buildMatchTeam(db, clubId, user!.lineup, user!.tactics, condition)
      : buildAiTeam(db, clubId, strengthOf(opponentId), condition, suspended);
  const mine = user !== undefined && (isUser(fixture.homeId) || isUser(fixture.awayId));
  return {
    home: teamFor(fixture.homeId, fixture.awayId),
    away: teamFor(fixture.awayId, fixture.homeId),
    seed: fixtureSeed(season, fixture),
    ...(mine && user.changes?.length ? { changes: user.changes } : {}),
  };
}

/** Simulates a fixture; a level cup tie goes to penalties taken by the players who finished the match. */
export function simulateFixture(db: GameDatabase, season: Season, fixture: Fixture, user?: UserTeam, condition?: ConditionState): MatchResult {
  const input = buildFixtureInput(db, season, fixture, user, condition);
  const result = simulateMatch(input);
  if (!needsPenalties(season, fixture, result.score)) return result;

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
  return recordResults(season, [{ fixtureId, result }]);
}

/** Stores several results at once (a matchday): one pass over the fixtures and the player totals. */
export function recordResults(season: Season, results: readonly { fixtureId: string; result: MatchResult }[]): Season {
  const byId = new Map(results.map((r) => [r.fixtureId, r.result]));
  const fixtures = new Map(season.fixtures.map((f) => [f.id, f]));
  const played: { fixture: Fixture; result: MatchResult }[] = [];
  for (const { fixtureId, result } of results) {
    const fixture = fixtures.get(fixtureId);
    if (!fixture) throw new RangeError(`Unknown fixture "${fixtureId}"`);
    if (fixture.result) throw new RangeError(`Fixture "${fixtureId}" has already been played`);
    played.push({ fixture, result });
  }
  return {
    ...season,
    fixtures: season.fixtures.map((f) => {
      const result = byId.get(f.id);
      return result ? { ...f, result: compactResult(result) } : f;
    }),
    playerStats: addMatchesToStats(season.playerStats, played),
  };
}

/** Draws the next round of every cup whose previous round has just finished. */
function advanceCup(season: Season): Season {
  const drawn = season.cups.flatMap((cup) => nextCupRound(season, cup.competitionId));
  return drawn.length ? { ...season, fixtures: [...season.fixtures, ...drawn] } : season;
}

export type PlayedDate = {
  season: Season;
  userMatch: { fixture: Fixture; result: MatchResult } | null;
  condition: ConditionState;
  /** Injuries picked up on this date, all clubs. */
  injuries: NewInjury[];
};

/**
 * Plays every unplayed fixture on `date`. The user's fixture (if any) uses
 * their team; its full result is returned for the match centre. Everyone
 * recovers up to `date` first; afterwards fitness, morale and injuries
 * reflect the matches.
 */
export function playDate(db: GameDatabase, season: Season, date: string, user?: UserTeam, condition?: ConditionState): PlayedDate {
  // Every match uses condition as it was at kick-off; the state is updated as each result comes in.
  const before = conditionOn(condition ?? emptyConditions(date), date);
  let userMatch: PlayedDate['userMatch'] = null;
  const played: { fixtureId: string; result: MatchResult; squads: Record<Side, readonly string[]> }[] = [];
  for (const fixture of season.fixtures) {
    if (fixture.date !== date || fixture.result) continue;
    const mine = user !== undefined && involves(fixture, user.clubId);
    const result = simulateFixture(db, season, fixture, mine ? user : undefined, before);
    played.push({ fixtureId: fixture.id, result, squads: { home: squadIds(db, fixture.homeId), away: squadIds(db, fixture.awayId) } });
    if (mine) userMatch = { fixture, result };
  }
  const next = recordResults(season, played);
  const applied = applyMatches(before, played, date);
  return { season: advanceCup(next), userMatch, condition: applied.state, injuries: applied.injuries };
}

/** Plays every date before the user's next fixture AI-only (e.g. cup rounds after the user was knocked out). */
function playEarlierDates(db: GameDatabase, season: Season, clubId: ClubId, condition?: ConditionState) {
  const target = nextFixtureFor(season, clubId);
  if (!target) throw new RangeError('No fixture left to play this season');
  let current = season;
  let cond = condition;
  const injuries: NewInjury[] = [];
  for (let date = nextDate(current); date !== null && date < target.date; date = nextDate(current)) {
    const played = playDate(db, current, date, undefined, cond);
    current = played.season;
    cond = played.condition;
    injuries.push(...played.injuries);
  }
  return { target, season: current, condition: cond, injuries };
}

/**
 * The user's next fixture as it will kick off, WITHOUT recording anything:
 * the season after any earlier AI-only dates, condition at kick-off, the
 * engine input and the result (with the user's in-match changes). This is
 * the live match; `advanceToUserFixture` with the same changes produces the
 * identical result and records it.
 */
export function prepareUserFixture(db: GameDatabase, season: Season, user: UserTeam, condition?: ConditionState) {
  const earlier = playEarlierDates(db, season, user.clubId, condition);
  const atKickOff = conditionOn(earlier.condition ?? emptyConditions(earlier.target.date), earlier.target.date);
  const side: Side = earlier.target.homeId === user.clubId ? 'home' : 'away';
  return {
    fixture: earlier.target,
    season: earlier.season,
    side,
    input: buildFixtureInput(db, earlier.season, earlier.target, user, atKickOff),
    result: simulateFixture(db, earlier.season, earlier.target, user, atKickOff),
  };
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
  condition?: ConditionState,
): { season: Season; fixture: Fixture; result: MatchResult; condition: ConditionState; injuries: NewInjury[] } {
  const { target, season: current, condition: cond, injuries } = playEarlierDates(db, season, user.clubId, condition);
  const played = playDate(db, current, target.date, user, cond);
  if (!played.userMatch) throw new Error(`Expected the user's fixture on ${target.date}`);
  return {
    season: played.season,
    fixture: played.userMatch.fixture,
    result: played.userMatch.result,
    condition: played.condition,
    injuries: [...injuries, ...played.injuries],
  };
}

/** Plays every remaining date (used once the user has no fixtures left). */
export function playRemaining(db: GameDatabase, season: Season, condition?: ConditionState): { season: Season; condition: ConditionState | undefined } {
  let current = season;
  let cond = condition;
  for (let date = nextDate(current); date !== null; date = nextDate(current)) {
    const played = playDate(db, current, date, undefined, cond);
    current = played.season;
    cond = played.condition;
  }
  return { season: current, condition: cond };
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

export type SeasonOutcome = { leagues: LeagueOutcome[]; cups: { competitionId: CompetitionId; winner: ClubId | null }[] };

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
    cups: season.cups.map((cup) => ({ competitionId: cup.competitionId, winner: cupWinner(season, cup.competitionId) })),
  };
}

/**
 * Next season's league memberships: within each country, each tier's
 * relegated clubs drop one tier and the tier below's promoted clubs go up.
 * Leagues keep their size as long as the places match (3 down, 3 up).
 * Single-division countries (abroad) keep their clubs.
 */
export function nextMemberships(db: GameDatabase, season: Season): LeagueMembership[] {
  const outcome = seasonOutcome(db, season).leagues;
  const countryOf = (competitionId: CompetitionId) => leagueForSeason(db, season, competitionId).country;
  return outcome.map((league) => {
    const pyramid = outcome.filter((o) => countryOf(o.competitionId) === countryOf(league.competitionId)).sort((a, b) => a.tier - b.tier);
    const i = pyramid.indexOf(league);
    const above = pyramid[i - 1];
    const below = pyramid[i + 1];
    const leaving = new Set([...(below ? league.relegated : []), ...(above ? league.promoted : [])]);
    const staying = league.table.map((r) => r.clubId).filter((id) => !leaving.has(id));
    const arriving = [...(above ? above.relegated : []), ...(below ? below.promoted : [])];
    return { competitionId: league.competitionId, clubIds: [...staying, ...arriving] };
  });
}

/** A new season one year on, with promotion/relegation applied and a fresh (derived) seed. */
export function startNextSeason(db: GameDatabase, season: Season): Season {
  if (!isSeasonComplete(season)) throw new RangeError('The current season is still in progress');
  return createSeason(db, season.startYear + 1, mixSeed(season.seed, 4242), nextMemberships(db, season), season);
}
