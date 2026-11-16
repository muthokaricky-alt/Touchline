import type { ClubId, GameDatabase } from '@/data/schemas';
import type { MatchChange, MatchInput } from '@/engine/types';

import { buildAiTeam } from '../ai/opponent';
import type { ConditionState } from '../condition/condition';
import type { Lineup } from '../lineup';
import type { Tactics } from '../tactics/tactics';
import { buildMatchTeam, lineupStrength } from './build-match-team';

export type MatchVenue = 'home' | 'away';

export type FriendlySetup = {
  db: GameDatabase;
  userClubId: ClubId;
  lineup: Lineup;
  tactics: Tactics;
  opponentId: ClubId;
  /** Where the USER's team plays. */
  venue: MatchVenue;
  seed: number;
  /** Players' condition today (friendlies use it but don't change it). */
  condition?: ConditionState;
  /** The user's in-match decisions. */
  changes?: readonly MatchChange[];
};

/**
 * Builds the engine input for a friendly: the user's team as selected, and
 * an AI-managed opponent that sets up against the user's actual strength.
 */
export function prepareFriendly({ db, userClubId, lineup, tactics, opponentId, venue, seed, condition, changes }: FriendlySetup): MatchInput {
  if (opponentId === userClubId) throw new RangeError('A club cannot play a friendly against itself');
  const user = buildMatchTeam(db, userClubId, lineup, tactics, condition);
  const opponent = buildAiTeam(db, opponentId, lineupStrength(lineup, user.squad), condition);
  const extra = changes?.length ? { changes } : {};
  return venue === 'home' ? { home: user, away: opponent, seed, ...extra } : { home: opponent, away: user, seed, ...extra };
}

/** A seed for a new match. Kept out of the engine so the engine stays pure. */
export function newMatchSeed(now: number = Date.now()): number {
  return Math.abs(Math.floor(now)) % 2_147_483_647;
}
