import { buildFictionalDatabase } from '@/data/fictional';

import { FORMATION_IDS, getFormation } from '../formations';
import {
  addSubstitute,
  assignToSlot,
  autoPickLineup,
  BENCH_SIZE,
  changeFormation,
  clearSlot,
  emptyLineup,
  isLineupPlayable,
  LineupSchema,
  removeFromLineup,
  startingSlotOf,
  starterIds,
  validateLineup,
  type Lineup,
} from '../lineup';
import { positionFit } from '../squad/position-fit';
import { selectSquadCandidates } from '../squad/squad-selectors';

const db = buildFictionalDatabase();
const CLUB = 'club_greywater_town';
const candidates = selectSquadCandidates(db, CLUB);
const otherClubPlayer = selectSquadCandidates(db, 'club_kestrel_bay')[0].player.id;

const picked = () => autoPickLineup(candidates, '4-4-2');
/** A reserve: in the squad but neither starting nor on the bench. */
function aReserve(lineup: Lineup) {
  const selected = new Set([...starterIds(lineup), ...lineup.substitutes]);
  return candidates.find((c) => !selected.has(c.player.id))!.player.id;
}

describe('autoPickLineup', () => {
  it.each(FORMATION_IDS)('builds a playable %s with a natural goalkeeper and a full bench', (formationId) => {
    const lineup = autoPickLineup(candidates, formationId);
    const issues = validateLineup(lineup, candidates);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(issues.map((i) => i.code)).not.toContain('no-goalkeeper');
    expect(starterIds(lineup)).toHaveLength(11);
    expect(lineup.substitutes).toHaveLength(BENCH_SIZE);
    expect(LineupSchema.safeParse(lineup).success).toBe(true);
  });

  it('puts exactly one goalkeeper on the bench', () => {
    const benchKeepers = picked().substitutes.filter(
      (id) => candidates.find((c) => c.player.id === id)!.player.primaryPosition === 'GK',
    );
    expect(benchKeepers).toHaveLength(1);
  });

  it.each(db.clubs.map((c) => c.id))(
    'plays nobody out of position in 4-4-2 for %s (the squad template fits it)',
    (clubId) => {
      const squad = selectSquadCandidates(db, clubId);
      const lineup = autoPickLineup(squad, '4-4-2');
      for (const slot of getFormation('4-4-2').slots) {
        const player = squad.find((c) => c.player.id === lineup.starters[slot.id])!.player;
        expect(positionFit(player, slot.position)).not.toBe('unfamiliar');
      }
    },
  );

  it('is deterministic', () => {
    expect(picked()).toEqual(picked());
  });

  it('leaves slots empty when there are not enough players', () => {
    const lineup = autoPickLineup(candidates.slice(0, 5), '4-4-2');
    expect(starterIds(lineup)).toHaveLength(5);
    expect(lineup.substitutes).toEqual([]);
  });
});

describe('assignToSlot', () => {
  it('swaps two starters', () => {
    const lineup = picked();
    const lb = lineup.starters.LB!;
    const rb = lineup.starters.RB!;
    const next = assignToSlot(lineup, 'LB', rb);
    expect(next.starters.LB).toBe(rb);
    expect(next.starters.RB).toBe(lb);
  });

  it('swaps a substitute with the starter they replace', () => {
    const lineup = picked();
    const sub = lineup.substitutes[2];
    const starter = lineup.starters.LST!;
    const next = assignToSlot(lineup, 'LST', sub);
    expect(next.starters.LST).toBe(sub);
    expect(next.substitutes[2]).toBe(starter);
    expect(next.substitutes).toHaveLength(BENCH_SIZE);
  });

  it('drops the replaced starter to reserves when a reserve comes in', () => {
    const lineup = picked();
    const reserve = aReserve(lineup);
    const replaced = lineup.starters.RM!;
    const next = assignToSlot(lineup, 'RM', reserve);
    expect(next.starters.RM).toBe(reserve);
    expect(startingSlotOf(next, replaced)).toBeNull();
    expect(next.substitutes).not.toContain(replaced);
  });

  it('moves a substitute into an empty slot, shrinking the bench', () => {
    const lineup = clearSlot(picked(), 'GK');
    const sub = lineup.substitutes[0];
    const next = assignToSlot(lineup, 'GK', sub);
    expect(next.starters.GK).toBe(sub);
    expect(next.substitutes).toHaveLength(BENCH_SIZE - 1);
  });

  it('returns the same lineup when the player is already in that slot', () => {
    const lineup = picked();
    expect(assignToSlot(lineup, 'GK', lineup.starters.GK!)).toBe(lineup);
  });

  it('does not mutate the original lineup', () => {
    const lineup = picked();
    const snapshot = structuredClone(lineup);
    assignToSlot(lineup, 'LB', lineup.starters.RB!);
    expect(lineup).toEqual(snapshot);
  });

  it('throws for a slot that is not in the formation', () => {
    expect(() => assignToSlot(picked(), 'DM', candidates[0].player.id)).toThrow(RangeError);
  });
});

describe('addSubstitute / removeFromLineup / clearSlot', () => {
  it('moving a starter to the bench empties their slot', () => {
    const lineup = removeFromLineup(picked(), picked().substitutes[0]); // make room
    const striker = lineup.starters.RST!;
    const next = addSubstitute(lineup, striker);
    expect(next.starters.RST).toBeNull();
    expect(next.substitutes).toContain(striker);
  });

  it('throws when the bench is full', () => {
    const lineup = picked();
    expect(() => addSubstitute(lineup, aReserve(lineup))).toThrow(RangeError);
  });

  it('ignores adding someone already on the bench', () => {
    const lineup = picked();
    expect(addSubstitute(lineup, lineup.substitutes[0])).toBe(lineup);
  });

  it('removes a starter or substitute, and ignores reserves', () => {
    const lineup = picked();
    expect(removeFromLineup(lineup, lineup.starters.GK!).starters.GK).toBeNull();
    expect(removeFromLineup(lineup, lineup.substitutes[0]).substitutes).toHaveLength(BENCH_SIZE - 1);
    expect(removeFromLineup(lineup, aReserve(lineup))).toBe(lineup);
  });

  it('clears a slot', () => {
    expect(clearSlot(picked(), 'LM').starters.LM).toBeNull();
  });
});

describe('changeFormation', () => {
  it('keeps the same eleven players in the new shape', () => {
    const lineup = picked();
    const next = changeFormation(lineup, '4-3-3', candidates);
    expect(next.formationId).toBe('4-3-3');
    expect(Object.keys(next.starters).sort()).toEqual(getFormation('4-3-3').slots.map((s) => s.id).sort());
    expect(starterIds(next).sort()).toEqual(starterIds(lineup).sort());
    expect(next.substitutes).toEqual(lineup.substitutes);
  });

  it('keeps the goalkeeper in goal', () => {
    const lineup = picked();
    expect(changeFormation(lineup, '3-5-2', candidates).starters.GK).toBe(lineup.starters.GK);
  });

  it('is a no-op for the current formation', () => {
    const lineup = picked();
    expect(changeFormation(lineup, '4-4-2', candidates)).toBe(lineup);
  });
});

describe('validateLineup', () => {
  const codes = (lineup: Lineup) => validateLineup(lineup, candidates).map((i) => i.code);

  it('reports every empty slot of an empty lineup as an error', () => {
    const issues = validateLineup(emptyLineup('4-4-2'), candidates);
    expect(issues).toHaveLength(11);
    expect(issues.every((i) => i.code === 'empty-slot' && i.severity === 'error')).toBe(true);
    expect(isLineupPlayable(issues)).toBe(false);
  });

  it('warns about an outfield player in goal', () => {
    const lineup = picked();
    expect(codes(assignToSlot(lineup, 'GK', lineup.starters.LST!))).toContain('no-goalkeeper');
  });

  it('warns about a player out of position, but it is still playable', () => {
    const lineup = picked();
    const swapped = assignToSlot(lineup, 'LCB', lineup.starters.LST!);
    const issues = validateLineup(swapped, candidates);
    expect(issues.map((i) => i.code)).toContain('out-of-position');
    expect(isLineupPlayable(issues)).toBe(true);
  });

  it('rejects players from another club', () => {
    const lineup = { ...picked(), substitutes: [otherClubPlayer] };
    expect(codes(lineup)).toContain('unknown-player');
  });

  it('rejects a player selected twice', () => {
    const lineup = picked();
    const duplicated = { ...lineup, substitutes: [lineup.starters.GK!] };
    expect(codes(duplicated)).toContain('duplicate-player');
  });

  it('rejects slots that are not in the formation', () => {
    const lineup = picked();
    expect(codes({ ...lineup, starters: { ...lineup.starters, DM: null } })).toContain('unknown-slot');
  });

  it('rejects an oversized bench', () => {
    const lineup = picked();
    const big = { ...lineup, substitutes: [...lineup.substitutes, aReserve(lineup)] };
    expect(codes(big)).toContain('bench-too-large');
    expect(LineupSchema.safeParse(big).success).toBe(false);
  });
});
