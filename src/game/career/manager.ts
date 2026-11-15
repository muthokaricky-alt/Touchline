import { z } from 'zod';

import { ClubIdSchema, type ClubId, type GameDatabase } from '@/data/schemas';
import { createRng } from '@/utils/random';

import { cupWinner } from '../season/cup';
import { mixSeed, type Fixture, type Season } from '../season/season';
import { competitionName, leagueForSeason, leagueOfClub, leagueTable, seasonOutcome } from '../season/season-flow';

/**
 * The manager's career (Milestone 9b): board expectations, board confidence,
 * reputation, sacking and job offers.
 *
 * Only the manager record is stored. Expectations and the end-of-season
 * review are DERIVED from the club, its league and the season, so they can
 * never disagree with the table.
 */

export const SeasonRecordSchema = z.strictObject({
  season: z.string(),
  clubId: ClubIdSchema,
  /** League position at the end, or null when he left mid-season. */
  finished: z.int().min(1).nullable(),
  target: z.int().min(1),
  outcome: z.enum(['completed', 'sacked', 'left']),
  trophies: z.array(z.string()),
});
export type SeasonRecord = z.infer<typeof SeasonRecordSchema>;

export const ManagerSchema = z.strictObject({
  name: z.string().trim().min(1).max(30),
  /** 1–100, career-long: decides which clubs want him. */
  reputation: z.int().min(1).max(100),
  /** 0–100, this job: below SACK_THRESHOLD he's sacked. */
  confidence: z.int().min(0).max(100),
  /** The board has already warned him this season. */
  warned: z.boolean(),
  /** Sacked and choosing between these offers (the game waits for him). */
  sackedOffers: z.array(ClubIdSchema).nullable(),
  history: z.array(SeasonRecordSchema),
});
export type Manager = z.infer<typeof ManagerSchema>;

export const WARNING_THRESHOLD = 35;
export const SACK_THRESHOLD = 15;
/** The board gives a new season this many league games before it can sack him. */
const GRACE_MATCHES = 8;
const NEW_JOB_CONFIDENCE = 60;

// --- Expectations ------------------------------------------------------------------------

export type Expectation = { competitionId: string; leagueName: string; tier: number; target: number; label: string };

/**
 * What the board wants: a league position, from the club's reputation rank
 * among this season's league clubs (biggest club → title).
 */
export function boardExpectation(db: GameDatabase, season: Season, clubId: ClubId): Expectation | null {
  const competitionId = leagueOfClub(season, clubId);
  if (!competitionId) return null;
  const league = leagueForSeason(db, season, competitionId);
  const reps = league.clubIds
    .map((id) => ({ id, rep: db.clubs.find((c) => c.id === id)?.reputation ?? 0 }))
    .sort((a, b) => b.rep - a.rep || a.id.localeCompare(b.id));
  const rank = reps.findIndex((c) => c.id === clubId) + 1;
  const size = league.clubIds.length;
  const safe = size - 3; // three go down
  const tier = league.tier;
  let target: number;
  let label: string;
  if (tier === 1) {
    if (rank === 1) [target, label] = [1, 'Win the league'];
    else if (rank <= 4) [target, label] = [4, 'Finish in the top four'];
    else if (rank <= 10) [target, label] = [10, 'Finish in the top half'];
    else if (rank <= 14) [target, label] = [14, 'A mid-table finish'];
    else [target, label] = [safe, 'Avoid relegation'];
  } else {
    if (rank <= 3) [target, label] = [3, 'Win promotion'];
    else if (rank <= 8) [target, label] = [8, 'Push for promotion'];
    else if (rank <= 14) [target, label] = [14, 'A mid-table finish'];
    else [target, label] = [safe, 'Avoid relegation'];
  }
  return { competitionId, leagueName: competitionName(db, competitionId), tier, target, label };
}

/** Points per game a team finishing `target` of 20 usually gets (≈ 2.3 for 1st … 1.0 for 17th). */
export function expectedPointsPerGame(target: number): number {
  return Math.max(0.9, 2.35 - 0.08 * (target - 1));
}

// --- During the season -----------------------------------------------------------------------

/**
 * Confidence after a league result: points versus what the target needs,
 * plus a 5% pull back towards neutral, so the board forgives old results.
 * Without the pull it would be a random walk and a manager performing
 * exactly at target could drift into the sack zone by bad luck alone.
 */
export function confidenceAfterMatch(confidence: number, points: number, target: number): number {
  const delta = 3 * (points - expectedPointsPerGame(target));
  const pull = 0.05 * (NEW_JOB_CONFIDENCE - confidence);
  return Math.max(0, Math.min(100, Math.round(confidence + delta + pull)));
}

export type BoardVerdict = { kind: 'fine' } | { kind: 'warning' } | { kind: 'sacked' };

export function boardVerdict(manager: Manager, leagueGamesPlayed: number): BoardVerdict {
  if (manager.confidence < SACK_THRESHOLD && leagueGamesPlayed >= GRACE_MATCHES) return { kind: 'sacked' };
  if (manager.confidence < WARNING_THRESHOLD && !manager.warned) return { kind: 'warning' };
  return { kind: 'fine' };
}

const pointsFor = (fixture: Fixture, clubId: ClubId): number | null => {
  if (!fixture.result) return null;
  const own = fixture.homeId === clubId ? fixture.result.score.home : fixture.result.score.away;
  const other = fixture.homeId === clubId ? fixture.result.score.away : fixture.result.score.home;
  return own > other ? 3 : own === other ? 1 : 0;
};

/** League results of `clubId` in fixtures newly played between two season states. */
export function newLeagueResults(before: Season, after: Season, clubId: ClubId): number[] {
  const leagueId = leagueOfClub(after, clubId);
  const wasPlayed = new Set(before.fixtures.filter((f) => f.result).map((f) => f.id));
  return after.fixtures
    .filter((f) => f.competitionId === leagueId && !wasPlayed.has(f.id) && (f.homeId === clubId || f.awayId === clubId))
    .map((f) => pointsFor(f, clubId))
    .filter((p): p is number => p !== null);
}

export function leagueGamesPlayed(season: Season, clubId: ClubId): number {
  const leagueId = leagueOfClub(season, clubId);
  return season.fixtures.filter((f) => f.competitionId === leagueId && f.result && (f.homeId === clubId || f.awayId === clubId)).length;
}

// --- Season review and job offers -------------------------------------------------------------

export type SeasonReview = {
  expectation: Expectation;
  finished: number;
  trophies: string[];
  promoted: boolean;
  relegated: boolean;
  /** Places above (+) or below (−) the target. */
  margin: number;
  verdict: string;
  reputationChange: number;
  /** He did so badly that the board lets him go at the end of the season. */
  sacked: boolean;
};

/** The board's verdict on a completed season. */
export function seasonReview(db: GameDatabase, season: Season, clubId: ClubId, confidence: number): SeasonReview | null {
  const expectation = boardExpectation(db, season, clubId);
  if (!expectation) return null;
  const table = leagueTable(db, season, expectation.competitionId);
  const finished = table.findIndex((r) => r.clubId === clubId) + 1;
  const outcome = seasonOutcome(db, season).leagues.find((l) => l.competitionId === expectation.competitionId)!;
  const trophies = [
    ...(outcome.champion === clubId ? [expectation.leagueName] : []),
    ...(season.cupId && cupWinner(season) === clubId ? [competitionName(db, season.cupId)] : []),
  ];
  const promoted = outcome.promoted.includes(clubId);
  const relegated = outcome.relegated.includes(clubId);
  const margin = expectation.target - finished;
  const reputationChange = Math.round(Math.max(-12, Math.min(12, 2 * margin)) + 8 * trophies.length + (promoted ? 6 : 0) - (relegated ? 6 : 0));
  const sacked = !trophies.length && !promoted && (relegated || margin <= -6) && confidence < WARNING_THRESHOLD;
  const verdict = trophies.length
    ? `Champions! The board is delighted.`
    : margin >= 3
      ? 'Well above expectations. The board is very pleased.'
      : margin >= 0
        ? 'Expectations met. The board is satisfied.'
        : margin >= -3
          ? 'Slightly below expectations. The board expects better next season.'
          : 'Well below expectations. The board is very disappointed.';
  return { expectation, finished, trophies, promoted, relegated, margin, verdict, reputationChange, sacked };
}

/** The club reputation (1–20 scale) a manager of this reputation is offered. */
const clubLevelFor = (reputation: number) => 4 + reputation / 8;

/**
 * Clubs offering him a job: those around his level (a little above for a
 * strong reputation), never his current club. Deterministic per seed.
 * `atLeastOne` (after a sacking) guarantees an offer from a smaller club.
 */
export function jobOffers(db: GameDatabase, reputation: number, currentClubId: ClubId, seed: number, atLeastOne: boolean): ClubId[] {
  const level = clubLevelFor(reputation);
  const rng = createRng(mixSeed(seed, 4242));
  const candidates = db.clubs
    .filter((c) => c.id !== currentClubId && Math.abs(c.reputation - level) <= 2)
    .sort((a, b) => a.id.localeCompare(b.id));
  const shuffled = candidates.map((c) => ({ c, k: rng.next() })).sort((a, b) => a.k - b.k).map((x) => x.c);
  const count = Math.min(shuffled.length, rng.int(atLeastOne ? 1 : 0, 3));
  const offers = shuffled.slice(0, count).map((c) => c.id);
  if (atLeastOne && offers.length === 0) {
    const smaller = db.clubs.filter((c) => c.id !== currentClubId).sort((a, b) => a.reputation - b.reputation || a.id.localeCompare(b.id));
    if (smaller.length) offers.push(smaller[0].id);
  }
  return offers;
}

// --- Starting and changing jobs --------------------------------------------------------------

/** A new manager's reputation: proportional to the club he starts at (it took him on). */
export function startingReputation(clubReputation: number): number {
  return Math.round(Math.max(1, Math.min(100, 20 + 2.5 * clubReputation)));
}

export function newManager(name: string, clubReputation: number): Manager {
  return { name: name.trim(), reputation: startingReputation(clubReputation), confidence: NEW_JOB_CONFIDENCE, warned: false, sackedOffers: null, history: [] };
}

/** A fresh start with the board at a new club. */
export function takeNewJob(manager: Manager): Manager {
  return { ...manager, confidence: NEW_JOB_CONFIDENCE, warned: false, sackedOffers: null };
}

/** Board mood at the start of a new season with the same club: last season's margin carries over. */
export function confidenceForNewSeason(review: SeasonReview): number {
  return Math.max(30, Math.min(90, Math.round(NEW_JOB_CONFIDENCE + 4 * review.margin + 10 * review.trophies.length + (review.promoted ? 10 : 0))));
}

export const clampReputation = (r: number) => Math.max(1, Math.min(100, Math.round(r)));
