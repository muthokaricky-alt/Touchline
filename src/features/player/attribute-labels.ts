import type { AttributeGroup, AttributeKey, PreferredFoot } from '@/data/schemas';

/** Display text for attribute names. Kept out of the data layer: it's presentation. */
export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  finishing: 'Finishing',
  passing: 'Passing',
  crossing: 'Crossing',
  dribbling: 'Dribbling',
  firstTouch: 'First touch',
  tackling: 'Tackling',
  marking: 'Marking',
  heading: 'Heading',
  vision: 'Vision',
  positioning: 'Positioning',
  decisions: 'Decisions',
  workRate: 'Work rate',
  composure: 'Composure',
  anticipation: 'Anticipation',
  pace: 'Pace',
  acceleration: 'Acceleration',
  stamina: 'Stamina',
  strength: 'Strength',
  handling: 'Handling',
  reflexes: 'Reflexes',
  aerialReach: 'Aerial reach',
  oneOnOnes: 'One on ones',
  kicking: 'Kicking',
};

export const ATTRIBUTE_GROUP_LABELS: Record<AttributeGroup, string> = {
  technical: 'Technical',
  mental: 'Mental',
  physical: 'Physical',
  goalkeeping: 'Goalkeeping',
};

export const FOOT_LABELS: Record<PreferredFoot, string> = {
  left: 'Left',
  right: 'Right',
  both: 'Either',
};
