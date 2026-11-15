import type { Position } from '@/data/schemas';
import { clamp } from '@/utils/math';

import type { PlayerMatchStats } from './types';

/**
 * Player match ratings: start at 6.0, add for contributions, subtract for
 * mistakes, nudge by the result. Kept deliberately readable; it's a
 * scoring rubric, not a statistical model.
 */

const DEFENSIVE_POSITIONS: ReadonlySet<Position> = new Set(['GK', 'CB', 'RB', 'LB', 'RWB', 'LWB', 'DM']);

export type RatingInput = Omit<PlayerMatchStats, 'rating'> & {
  teamGoals: number;
  opponentGoals: number;
};

export function playerRating(s: RatingInput): number {
  let rating = 6.0;

  // Attacking contributions
  rating += s.goals * 1.0 + s.assists * 0.6;
  rating += s.shotsOnTarget * 0.12 - (s.shots - s.shotsOnTarget) * 0.03;

  // Defending and goalkeeping
  rating += s.saves * 0.3 + s.tackles * 0.12;
  if (s.position === 'GK') rating -= s.goalsConceded * 0.35;
  else if (DEFENSIVE_POSITIONS.has(s.position)) rating -= s.goalsConceded * 0.15;
  if (DEFENSIVE_POSITIONS.has(s.position) && s.goalsConceded === 0 && s.minutesPlayed >= 60) {
    rating += s.position === 'GK' ? 0.6 : 0.4;
  }

  // Discipline
  rating -= s.fouls * 0.05 + s.yellowCards * 0.4 + (s.redCard ? 1.5 : 0);

  // Result, weighted by time on the pitch
  const share = Math.min(1, s.minutesPlayed / 90);
  if (s.teamGoals > s.opponentGoals) rating += 0.3 * share;
  else if (s.teamGoals < s.opponentGoals) rating -= 0.3 * share;

  return Math.round(clamp(rating, 3, 10) * 10) / 10;
}
