import { RICK_KYALO_ID } from '@/data/fictional';
import type { ClubId, GameDatabase } from '@/data/schemas';

import { addContract } from '../transfers/complete';
import { wageDemand } from '../transfers/valuation';

/** His first contract: as long as contracts go. */
export const RICK_KYALO_YEARS = 5;
/** All his outfield attributes are 20, so that's his ability as a striker. */
const ABILITY = 20;

/**
 * Signs Rick Kyalo (the hand-made all-20s striker) to the club the user picks
 * for a new career. His wage is the usual demand for a player of his ability
 * at that club, and the club's wage budget grows by the same amount, so his
 * arrival doesn't leave the user without room to sign anyone else.
 *
 * Returns the world unchanged if he isn't in it (retired, or a test world
 * without him) or already has a club.
 */
export function signRickKyalo(db: GameDatabase, clubId: ClubId, date: string): GameDatabase {
  const club = db.clubs.find((c) => c.id === clubId);
  if (!club) throw new RangeError('Unknown club.');
  if (!db.players.some((p) => p.id === RICK_KYALO_ID) || db.contracts.some((c) => c.playerId === RICK_KYALO_ID)) return db;
  const wage = wageDemand({ ability: ABILITY, clubReputation: club.reputation, currentWage: null });
  const signed = addContract(db, RICK_KYALO_ID, clubId, wage, RICK_KYALO_YEARS, date);
  return {
    ...signed,
    clubs: signed.clubs.map((c) => (c.id === clubId ? { ...c, finances: { ...c.finances, weeklyWageBudget: c.finances.weeklyWageBudget + wage } } : c)),
  };
}
