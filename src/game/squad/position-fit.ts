import { ATTRIBUTE_MAX, ATTRIBUTE_MIN, type Player, type PlayerAttributes, type Position } from '@/data/schemas';
import { clamp } from '@/utils/math';

import { positionRating } from '../ratings';

/**
 * How familiar a player is with a position:
 *   natural       their primary position
 *   accomplished  one of their secondary positions
 *   unfamiliar    anything else
 */
export type PositionFit = 'natural' | 'accomplished' | 'unfamiliar';

/**
 * Rating points lost for playing out of position.
 *
 * The attribute weights already make wildly wrong choices look bad (a
 * striker's goalkeeping attributes make them a terrible keeper). The
 * penalty covers *similar* roles: a right winger and a left midfielder
 * share most weighted attributes, so without a meaningful penalty position
 * choice would barely matter. 5 was chosen so auto-pick prefers a natural
 * player unless the alternative is clearly better (tested in lineup.test.ts).
 */
export const FIT_PENALTY: Record<PositionFit, number> = {
  natural: 0,
  accomplished: 1,
  unfamiliar: 5,
};

type PositionedPlayer = Pick<Player, 'primaryPosition' | 'secondaryPositions'>;

export function positionFit(player: PositionedPlayer, position: Position): PositionFit {
  if (player.primaryPosition === position) return 'natural';
  if (player.secondaryPositions.includes(position)) return 'accomplished';
  return 'unfamiliar';
}

/** Rating at `position` after the familiarity penalty. Unrounded, 1–20. */
export function effectiveRating(player: PositionedPlayer, attributes: PlayerAttributes, position: Position): number {
  const penalty = FIT_PENALTY[positionFit(player, position)];
  return clamp(positionRating(attributes, position) - penalty, ATTRIBUTE_MIN, ATTRIBUTE_MAX);
}
