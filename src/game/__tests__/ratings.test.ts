import { buildFictionalDatabase } from '@/data/fictional';
import { ATTRIBUTE_KEYS, POSITIONS, type PlayerAttributes } from '@/data/schemas';

import { flattenAttributes, POSITION_WEIGHTS, positionRating, ratingTier } from '../ratings';
import { effectiveRating, positionFit } from '../squad/position-fit';

const db = buildFictionalDatabase();

/** Attributes with every value set to `value`. */
function uniformAttributes(value: number): PlayerAttributes {
  const group = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, value]));
  return {
    playerId: 'plr_test',
    technical: group(ATTRIBUTE_KEYS.technical),
    mental: group(ATTRIBUTE_KEYS.mental),
    physical: group(ATTRIBUTE_KEYS.physical),
    goalkeeping: group(ATTRIBUTE_KEYS.goalkeeping),
  } as PlayerAttributes;
}

describe('POSITION_WEIGHTS', () => {
  it('defines positive weights for every position', () => {
    for (const position of POSITIONS) {
      const weights = Object.values(POSITION_WEIGHTS[position]);
      expect(weights.length).toBeGreaterThan(3);
      weights.forEach((w) => expect(w).toBeGreaterThan(0));
    }
  });
});

describe('positionRating', () => {
  it('equals the attribute value when every attribute is the same', () => {
    for (const position of POSITIONS) {
      expect(positionRating(uniformAttributes(14), position)).toBeCloseTo(14);
    }
  });

  it('only depends on the attributes a position weights', () => {
    const base = uniformAttributes(10);
    const betterFinisher = { ...base, technical: { ...base.technical, finishing: 20 } };
    expect(positionRating(betterFinisher, 'ST')).toBeGreaterThan(positionRating(base, 'ST'));
    expect(positionRating(betterFinisher, 'CB')).toBe(positionRating(base, 'CB'));
  });

  it('rates generated goalkeepers far better in goal than outfield players', () => {
    const gks = db.players.filter((p) => p.primaryPosition === 'GK').map((p) => p.id);
    for (const id of gks) {
      const attrs = db.attributes.find((a) => a.playerId === id)!;
      expect(positionRating(attrs, 'GK')).toBeGreaterThan(positionRating(attrs, 'ST') + 4);
    }
  });
});

describe('flattenAttributes', () => {
  it('contains every attribute from all four groups', () => {
    const flat = flattenAttributes(uniformAttributes(7));
    const allKeys = Object.values(ATTRIBUTE_KEYS).flat();
    expect(Object.keys(flat).sort()).toEqual([...allKeys].sort());
  });
});

describe('ratingTier', () => {
  it.each([
    [1, 'poor'],
    [5, 'poor'],
    [5.6, 'average'],
    [10, 'average'],
    [11, 'good'],
    [15, 'good'],
    [16, 'excellent'],
    [20, 'excellent'],
  ] as const)('%d → %s', (value, tier) => {
    expect(ratingTier(value)).toBe(tier);
  });
});

describe('positionFit / effectiveRating', () => {
  const player = { primaryPosition: 'CM' as const, secondaryPositions: ['DM' as const] };

  it('classifies natural, accomplished and unfamiliar positions', () => {
    expect(positionFit(player, 'CM')).toBe('natural');
    expect(positionFit(player, 'DM')).toBe('accomplished');
    expect(positionFit(player, 'ST')).toBe('unfamiliar');
  });

  it('applies the familiarity penalty', () => {
    const attrs = uniformAttributes(12);
    expect(effectiveRating(player, attrs, 'CM')).toBeCloseTo(12);
    expect(effectiveRating(player, attrs, 'DM')).toBeCloseTo(11);
    expect(effectiveRating(player, attrs, 'ST')).toBeCloseTo(7);
  });

  it('never drops below 1', () => {
    expect(effectiveRating(player, uniformAttributes(1), 'GK')).toBe(1);
  });
});
