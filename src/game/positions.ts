import type { Position } from '@/data/schemas';

/** Squad-list grouping of positions. */
export type PositionGroup = 'goalkeepers' | 'defenders' | 'midfielders' | 'attackers';

export const POSITION_GROUP: Record<Position, PositionGroup> = {
  GK: 'goalkeepers',
  RB: 'defenders',
  CB: 'defenders',
  LB: 'defenders',
  RWB: 'defenders',
  LWB: 'defenders',
  DM: 'midfielders',
  CM: 'midfielders',
  RM: 'midfielders',
  LM: 'midfielders',
  AM: 'midfielders',
  RW: 'attackers',
  LW: 'attackers',
  ST: 'attackers',
};

export const POSITION_GROUP_ORDER: readonly PositionGroup[] = ['goalkeepers', 'defenders', 'midfielders', 'attackers'];

export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  goalkeepers: 'Goalkeepers',
  defenders: 'Defenders',
  midfielders: 'Midfielders',
  attackers: 'Attackers',
};

/** Full names, used for accessibility labels and tooltips. */
export const POSITION_NAMES: Record<Position, string> = {
  GK: 'Goalkeeper',
  RB: 'Right back',
  CB: 'Centre back',
  LB: 'Left back',
  RWB: 'Right wing-back',
  LWB: 'Left wing-back',
  DM: 'Defensive midfielder',
  CM: 'Central midfielder',
  RM: 'Right midfielder',
  LM: 'Left midfielder',
  AM: 'Attacking midfielder',
  RW: 'Right winger',
  LW: 'Left winger',
  ST: 'Striker',
};
