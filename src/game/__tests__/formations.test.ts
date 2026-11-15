import { POSITIONS } from '@/data/schemas';

import { DEFAULT_FORMATION_ID, FORMATION_IDS, FORMATION_LIST, FORMATIONS, FormationIdSchema } from '../formations';

describe('formations', () => {
  it.each(FORMATION_IDS)('%s has 11 uniquely named slots and exactly one goalkeeper', (id) => {
    const { slots } = FORMATIONS[id];
    expect(slots).toHaveLength(11);
    expect(new Set(slots.map((s) => s.id)).size).toBe(11);
    expect(slots.filter((s) => s.position === 'GK')).toHaveLength(1);
  });

  it.each(FORMATION_IDS)('%s matches its name (defenders-midfielders-attackers)', (id) => {
    // e.g. "4-2-3-1" → 4 defenders, then 2 + 3 midfield/attacking lines, then 1.
    const lines = id.split('-').map(Number);
    expect(lines.reduce((a, b) => a + b, 0)).toBe(10);
    const defenders = FORMATIONS[id].slots.filter((s) => ['CB', 'LB', 'RB'].includes(s.position) || (s.y < 0.4 && s.position !== 'GK'));
    expect(defenders).toHaveLength(lines[0]);
  });

  it.each(FORMATION_IDS)('%s keeps every slot on the pitch and uses valid positions', (id) => {
    for (const slot of FORMATIONS[id].slots) {
      expect(POSITIONS).toContain(slot.position);
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x).toBeLessThanOrEqual(1);
      expect(slot.y).toBeGreaterThan(0);
      expect(slot.y).toBeLessThan(1);
    }
  });

  it('lists every formation once, in id order', () => {
    expect(FORMATION_LIST.map((f) => f.id)).toEqual([...FORMATION_IDS]);
  });

  it('validates formation ids', () => {
    expect(FormationIdSchema.safeParse(DEFAULT_FORMATION_ID).success).toBe(true);
    expect(FormationIdSchema.safeParse('4-4-3').success).toBe(false);
  });
});
