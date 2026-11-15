import type { ClubId, CompetitionId, GameDatabase, League } from '@/data/schemas';
import { simulateMatch } from '@/engine/simulate';
import type { MatchInput, MatchResult } from '@/engine/types';

import { buildAiTeam, chooseAiLineup } from '../ai/opponent';
import type { Lineup } from '../lineup';
import { buildMatchTeam, lineupStrength } from '../match/build-match-team';
import { selectSquadCandidates } from '../squad/squad-selectors';
import type { Tactics } from '../tactics/tactics';
import { scheduleLeague } from './fixtures';
import { seasonLabel, type Fixture, type FixtureResult, type Season } from './season';

/**
 * The season loop as pure functions. Each returns a NEW Season (immutable,
 * like the lineup functions), so the store can just swap it in.
 *
 *   createSeason → [ playUserFixture → (AI fixtures of that matchday) ]× → startNextSeason
 */

export type UserTeam = { clubId: ClubId; lineup: Lineup; tactics: Tactics };

export function findLeague(db: GameDatabase, competitionId: CompetitionId): League {
  const league = db.competitions.find((c) => c.id === competitionId);
  if (!league) throw new RangeError(`Unknown competition "${competitionId}"`);
  return league;
}

export function createSeason(db: GameDatabase, competitionId: CompetitionId, startYear: number, seed: number): Season {
  const league = findLeague(db, competitionId);
  return {
    label: seasonLabel(startYear),
    startYear,
    competitionId,
    seed,
    fixtures: scheduleLeague({
      competitionId,
      clubIds: league.clubIds,
      roundsPerOpponent: league.rules.roundsPerOpponent,
      startYear,
      seed,
    }),
  };
}

/** A new season one year on, with a fresh fixture list (seed derived, so it's still deterministic). */
export function startNextSeason(db: GameDatabase, season: Season): Season {
  const seed = (Math.imul(season.seed, 31) + 7) >>> 1;
  return createSeason(db, season.competitionId, season.startYear + 1, seed);
}

// --- Queries -----------------------------------------------------------------

export const totalMatchdays = (season: Season) => Math.max(0, ...season.fixtures.map((f) => f.matchday));

/** The lowest matchday with an unplayed fixture, or null when the season is over. */
export function currentMatchday(season: Season): number | null {
  const unplayed = season.fixtures.filter((f) => !f.result).map((f) => f.matchday);
  return unplayed.length ? Math.min(...unplayed) : null;
}

export const isSeasonComplete = (season: Season) => currentMatchday(season) === null;

export function nextFixtureFor(season: Season, clubId: ClubId): Fixture | null {
  return (
    season.fixtures
      .filter((f) => !f.result && (f.homeId === clubId || f.awayId === clubId))
      .sort((a, b) => a.matchday - b.matchday)[0] ?? null
  );
}

/** Played fixtures of a club, oldest first. */
export function playedFixturesOf(season: Season, clubId: ClubId): Fixture[] {
  return season.fixtures
    .filter((f) => f.result && (f.homeId === clubId || f.awayId === clubId))
    .sort((a, b) => a.matchday - b.matchday);
}

// --- Playing -----------------------------------------------------------------

/** Per-fixture seed: season seed mixed with a hash of the fixture id. */
export function fixtureSeed(season: Season, fixture: Fixture): number {
  let h = season.seed >>> 0;
  for (let i = 0; i < fixture.id.length; i++) h = (Math.imul(h, 31) + fixture.id.charCodeAt(i)) >>> 0;
  return h % 2_147_483_647;
}

/**
 * Engine input for a fixture. The user's side uses their lineup and tactics;
 * AI sides set up against their opponent's strength.
 */
export function buildFixtureInput(db: GameDatabase, season: Season, fixture: Fixture, user?: UserTeam): MatchInput {
  const strengthOf = (clubId: ClubId) => {
    const squad = selectSquadCandidates(db, clubId);
    return user && clubId === user.clubId ? lineupStrength(user.lineup, squad) : lineupStrength(chooseAiLineup(squad), squad);
  };
  const teamFor = (clubId: ClubId, opponentId: ClubId) =>
    user && clubId === user.clubId
      ? buildMatchTeam(db, clubId, user.lineup, user.tactics)
      : buildAiTeam(db, clubId, strengthOf(opponentId));
  return {
    home: teamFor(fixture.homeId, fixture.awayId),
    away: teamFor(fixture.awayId, fixture.homeId),
    seed: fixtureSeed(season, fixture),
  };
}

/** Shrinks a full MatchResult to what a season stores. */
export function compactResult(result: MatchResult): FixtureResult {
  return {
    score: result.score,
    goals: result.events.flatMap((e) =>
      e.type === 'goal'
        ? [{ minute: e.minute, ...(e.addedTime ? { addedTime: e.addedTime } : {}), side: e.side, scorerId: e.scorerId, assistId: e.assistId }]
        : [],
    ),
    cards: result.events.flatMap((e) =>
      e.type === 'card'
        ? [{ minute: e.minute, ...(e.addedTime ? { addedTime: e.addedTime } : {}), side: e.side, playerId: e.playerId, card: e.card }]
        : [],
    ),
    players: result.players.map((p) => ({
      playerId: p.playerId,
      side: p.side,
      position: p.position,
      started: p.started,
      minutes: p.minutesPlayed,
      goals: p.goals,
      assists: p.assists,
      yellowCards: p.yellowCards,
      redCard: p.redCard,
      rating: p.rating,
    })),
    playerOfTheMatch: result.playerOfTheMatch,
  };
}

export function recordResult(season: Season, fixtureId: string, result: FixtureResult): Season {
  const fixture = season.fixtures.find((f) => f.id === fixtureId);
  if (!fixture) throw new RangeError(`Unknown fixture "${fixtureId}"`);
  if (fixture.result) throw new RangeError(`Fixture "${fixtureId}" has already been played`);
  return { ...season, fixtures: season.fixtures.map((f) => (f.id === fixtureId ? { ...f, result } : f)) };
}

/** Simulates every unplayed fixture of a matchday that doesn't involve the user. */
export function playAiFixtures(db: GameDatabase, season: Season, matchday: number, userClubId: ClubId | null): Season {
  let next = season;
  for (const fixture of season.fixtures) {
    if (fixture.matchday !== matchday || fixture.result) continue;
    if (fixture.homeId === userClubId || fixture.awayId === userClubId) continue;
    next = recordResult(next, fixture.id, compactResult(simulateMatch(buildFixtureInput(db, season, fixture))));
  }
  return next;
}

/**
 * Plays the user's next fixture, then the rest of that matchday.
 * Returns the updated season and the full result of the user's match (for
 * the match centre; the season keeps only the compact version).
 */
export function playUserFixture(
  db: GameDatabase,
  season: Season,
  user: UserTeam,
): { season: Season; fixture: Fixture; result: MatchResult } {
  const fixture = nextFixtureFor(season, user.clubId);
  if (!fixture) throw new RangeError('No fixture left to play this season');
  const matchday = currentMatchday(season);
  if (matchday !== null && fixture.matchday !== matchday) {
    throw new RangeError(`Matchday ${matchday} must be completed before matchday ${fixture.matchday}`);
  }
  const result = simulateMatch(buildFixtureInput(db, season, fixture, user));
  const recorded = recordResult(season, fixture.id, compactResult(result));
  return { season: playAiFixtures(db, recorded, fixture.matchday, user.clubId), fixture, result };
}

/** For a matchday the user isn't involved in (odd league sizes, a bye): just play the AI games. */
export function playMatchdayWithoutUser(db: GameDatabase, season: Season, userClubId: ClubId): Season {
  const matchday = currentMatchday(season);
  return matchday === null ? season : playAiFixtures(db, season, matchday, userClubId);
}
