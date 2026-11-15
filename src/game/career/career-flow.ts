import type { ClubId, GameDatabase } from '@/data/schemas';
import { formatOrdinal } from '@/utils/format';

import type { NewMessage } from '../inbox/inbox';
import { mixSeed, type Season } from '../season/season';
import {
  boardExpectation,
  boardVerdict,
  clampReputation,
  confidenceAfterMatch,
  confidenceForNewSeason,
  jobOffers,
  leagueGamesPlayed,
  newLeagueResults,
  seasonReview,
  takeNewJob,
  type Manager,
  type SeasonReview,
} from './manager';

/**
 * The manager's career as pure transitions; the store calls these and
 * stores the result (same pattern as transfers/career.ts).
 */

const SACKING_REPUTATION_LOSS = 8;

const clubName = (db: GameDatabase, id: ClubId) => db.clubs.find((c) => c.id === id)?.name ?? id;

export type ManagerUpdate = { manager: Manager; messages: NewMessage[] };

/** After the user's matchday: the board reacts to new league results (warning, or the sack with job offers). */
export function afterUserMatchday(db: GameDatabase, before: Season, after: Season, clubId: ClubId, manager: Manager, date: string): ManagerUpdate {
  const expectation = boardExpectation(db, after, clubId);
  if (!expectation) return { manager, messages: [] };
  let next = manager;
  for (const points of newLeagueResults(before, after, clubId)) {
    next = { ...next, confidence: confidenceAfterMatch(next.confidence, points, expectation.target) };
  }
  const verdict = boardVerdict(next, leagueGamesPlayed(after, clubId));
  if (verdict.kind === 'warning') {
    return {
      manager: { ...next, warned: true },
      messages: [
        {
          date,
          category: 'squad',
          from: 'Chairman',
          title: 'The board is concerned',
          body: `Results are well short of what we expect (${expectation.label.toLowerCase()}). Things need to improve quickly.`,
        },
      ],
    };
  }
  if (verdict.kind === 'sacked') {
    const reputation = clampReputation(next.reputation - SACKING_REPUTATION_LOSS);
    const offers = jobOffers(db, reputation, clubId, mixSeed(after.seed, Number(date.replace(/-/g, ''))), true);
    return {
      manager: {
        ...next,
        reputation,
        sackedOffers: offers,
        history: [...next.history, { season: after.label, clubId, finished: null, target: expectation.target, outcome: 'sacked', trophies: [] }],
      },
      messages: [
        {
          date,
          category: 'squad',
          from: 'Chairman',
          title: `You have been sacked by ${clubName(db, clubId)}`,
          body: `The board has lost confidence in you. ${offers.length === 1 ? 'One club has' : `${offers.length} clubs have`} been in touch: ${offers.map((id) => clubName(db, id)).join(', ')}. Choose your next job on the dashboard.`,
        },
      ],
    };
  }
  return { manager: next, messages: [] };
}

export type SeasonEnd = { review: SeasonReview; offers: ClubId[] };

/** The board's review of a completed season and the clubs offering him a job (derived, deterministic). */
export function seasonEnd(db: GameDatabase, season: Season, clubId: ClubId, manager: Manager): SeasonEnd | null {
  const review = seasonReview(db, season, clubId, manager.confidence);
  if (!review) return null;
  const reputation = clampReputation(manager.reputation + review.reputationChange - (review.sacked ? SACKING_REPUTATION_LOSS : 0));
  return { review, offers: jobOffers(db, reputation, clubId, season.seed, review.sacked) };
}

/**
 * Closes the season for the manager: reputation, history, and either a new
 * season with the board (confidence from the review) or a move to
 * `newClubId` (one of the offers). Throws if he was sacked and didn't pick.
 */
export function closeSeason(
  db: GameDatabase,
  season: Season,
  clubId: ClubId,
  manager: Manager,
  newClubId: ClubId | null,
  date: string,
): ManagerUpdate & { clubId: ClubId } {
  const end = seasonEnd(db, season, clubId, manager);
  if (!end) return { manager, messages: [], clubId };
  const { review, offers } = end;
  if (newClubId !== null && !offers.includes(newClubId)) throw new RangeError("That club hasn't offered you a job.");
  if (review.sacked && newClubId === null) throw new RangeError('You were sacked: choose one of the clubs that offered you a job.');

  const record = {
    season: season.label,
    clubId,
    finished: review.finished,
    target: review.expectation.target,
    outcome: review.sacked ? ('sacked' as const) : newClubId ? ('left' as const) : ('completed' as const),
    trophies: review.trophies,
  };
  const reputation = clampReputation(manager.reputation + review.reputationChange - (review.sacked ? SACKING_REPUTATION_LOSS : 0));
  const base: Manager = { ...manager, reputation, history: [...manager.history, record] };
  const moving = newClubId !== null;
  const nextManager = moving ? takeNewJob(base) : { ...base, confidence: confidenceForNewSeason(review), warned: false };
  const message: NewMessage = {
    date,
    category: 'squad',
    from: 'Chairman',
    title: review.sacked ? `${clubName(db, clubId)} have let you go` : moving ? `You are the new manager of ${clubName(db, newClubId!)}` : `Season review: ${review.verdict}`,
    body:
      `Finished ${formatOrdinal(review.finished)} (target: ${review.expectation.label.toLowerCase()}, ${formatOrdinal(review.expectation.target)} or better).` +
      (review.trophies.length ? ` Trophies: ${review.trophies.join(', ')}.` : '') +
      ` Reputation ${reputation >= manager.reputation ? '+' : ''}${reputation - manager.reputation} (now ${reputation}).`,
  };
  return { manager: nextManager, messages: [message], clubId: newClubId ?? clubId };
}
