import {
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  type AttributeKey,
  type PlayerAttributes,
  type Position,
} from '@/data/schemas';
import { clamp } from '@/utils/math';

/**
 * How well a player's attributes suit a position, on the same 1–20 scale as
 * the attributes themselves.
 *
 * It's a weighted average: each position cares about a handful of
 * attributes, some more than others (weight 1–4). The match engine
 * (Milestone 5) can reuse these weights when deciding who wins duels.
 */
type Weights = Partial<Record<AttributeKey, number>>;

const GOALKEEPER: Weights = {
  handling: 3, reflexes: 3, aerialReach: 2, oneOnOnes: 2, positioning: 2, kicking: 1, decisions: 1, composure: 1,
};
const CENTRE_BACK: Weights = {
  marking: 3, tackling: 3, positioning: 3, heading: 2, strength: 2, anticipation: 1, decisions: 1, pace: 1, composure: 1,
};
const FULL_BACK: Weights = {
  tackling: 2, marking: 2, pace: 2, stamina: 2, crossing: 2, acceleration: 1, positioning: 1, workRate: 1,
};
const WING_BACK: Weights = {
  stamina: 3, crossing: 3, pace: 2, workRate: 2, acceleration: 1, dribbling: 1, tackling: 1,
};
const DEFENSIVE_MID: Weights = {
  tackling: 3, positioning: 3, passing: 2, decisions: 2, workRate: 2, anticipation: 2, stamina: 1, strength: 1,
};
const CENTRAL_MID: Weights = {
  passing: 3, vision: 2, decisions: 2, firstTouch: 2, stamina: 2, workRate: 1, tackling: 1, composure: 1,
};
const WIDE_MID: Weights = {
  crossing: 3, pace: 2, stamina: 2, dribbling: 2, passing: 1, workRate: 1, acceleration: 1,
};
const ATTACKING_MID: Weights = {
  vision: 3, passing: 3, dribbling: 2, firstTouch: 2, composure: 1, decisions: 1, finishing: 1,
};
const WINGER: Weights = {
  pace: 3, dribbling: 3, acceleration: 2, crossing: 2, finishing: 1, firstTouch: 1,
};
const STRIKER: Weights = {
  finishing: 4, composure: 2, anticipation: 2, firstTouch: 1, heading: 1, pace: 1, acceleration: 1, strength: 1,
};

export const POSITION_WEIGHTS: Record<Position, Weights> = {
  GK: GOALKEEPER,
  CB: CENTRE_BACK,
  RB: FULL_BACK, LB: FULL_BACK,
  RWB: WING_BACK, LWB: WING_BACK,
  DM: DEFENSIVE_MID,
  CM: CENTRAL_MID,
  RM: WIDE_MID, LM: WIDE_MID,
  AM: ATTACKING_MID,
  RW: WINGER, LW: WINGER,
  ST: STRIKER,
};

/** All four attribute groups merged into one lookup: `flat.finishing`, `flat.reflexes`... */
export function flattenAttributes(attributes: PlayerAttributes): Record<AttributeKey, number> {
  return { ...attributes.technical, ...attributes.mental, ...attributes.physical, ...attributes.goalkeeping };
}

/**
 * Ratings already worked out, per attributes object. Attribute records are
 * immutable (development replaces a changed player's record and leaves the
 * rest alone), so a cached number can never go stale, and the WeakMap lets
 * replaced records be garbage-collected. Auto-pick asks for the same ratings
 * thousands of times (every candidate × slot × formation). Measured in Jest:
 * the kick-off after a new month went from ~410 ms to ~180 ms, a normal one
 * from ~120 ms to ~100 ms.
 */
const ratingCache = new WeakMap<PlayerAttributes, Partial<Record<Position, number>>>();

/** Unrounded 1–20 suitability of `attributes` for `position`. */
export function positionRating(attributes: PlayerAttributes, position: Position): number {
  let perPosition = ratingCache.get(attributes);
  if (!perPosition) {
    perPosition = {};
    ratingCache.set(attributes, perPosition);
  }
  const cached = perPosition[position];
  if (cached !== undefined) return cached;
  const rating = computePositionRating(attributes, position);
  perPosition[position] = rating;
  return rating;
}

function computePositionRating(attributes: PlayerAttributes, position: Position): number {
  const values = flattenAttributes(attributes);
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(POSITION_WEIGHTS[position]) as [AttributeKey, number][]) {
    total += values[key] * weight;
    weightSum += weight;
  }
  return clamp(total / weightSum, ATTRIBUTE_MIN, ATTRIBUTE_MAX);
}

/** Display bands for any 1–20 value (attributes and ratings). */
export type RatingTier = 'poor' | 'average' | 'good' | 'excellent';

export function ratingTier(value: number): RatingTier {
  const rounded = Math.round(value);
  if (rounded >= 16) return 'excellent';
  if (rounded >= 11) return 'good';
  if (rounded >= 6) return 'average';
  return 'poor';
}
