/**
 * Shared football primitives.
 *
 * Kept deliberately small in Milestone 1. Full player, club and competition
 * models (with Zod schemas) arrive in Milestone 2.
 */

/** Result of a match from one team's perspective. */
export type MatchOutcome = 'W' | 'D' | 'L';
