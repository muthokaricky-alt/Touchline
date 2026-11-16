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
  LOW_FITNESS,
  removeFromLineup,
  startingSlotOf,
  starterIds,
  swapPlaces,
  validateLineup,
  type Lineup,
} from '../lineup';
import { effectiveRating, positionFit } from '../squad/position-fit';
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

  /*
   * The squad template fits 4-4-2, but weak clubs can have very poor
   * naturals, so a much better player can rightly start out of position
   * even after the −5 penalty. The rule that must hold: an out-of-position
   * pick is never made while an unused natural is at least as good.
   */
  it.each(db.clubs.map((c) => c.id))(
    'never prefers an out-of-position player over an equally good unused natural in 4-4-2 for %s',
    (clubId) => {
      const squad = selectSquadCandidates(db, clubId);
      const lineup = autoPickLineup(squad, '4-4-2');
      const starting = new Set(Object.values(lineup.starters));
      for (const slot of getFormation('4-4-2').slots) {
        const picked = squad.find((c) => c.player.id === lineup.starters[slot.id])!;
        if (positionFit(picked.player, slot.position) !== 'unfamiliar') continue;
        const pickedRating = effectiveRating(picked.player, picked.attributes, slot.position);
        const unusedNaturals = squad.filter((c) => !starting.has(c.player.id) && c.player.primaryPosition === slot.position);
        for (const natural of unusedNaturals) {
          expect(effectiveRating(natural.player, natural.attributes, slot.position)).toBeLessThan(pickedRating);
        }
      }
    },
  );

  it('plays the vast majority of slots with natural or accomplished players across all clubs', () => {
    let slots = 0;
    let unfamiliar = 0;
    for (const club of db.clubs) {
      const squad = selectSquadCandidates(db, club.id);
      const lineup = autoPickLineup(squad, '4-4-2');
      for (const slot of getFormation('4-4-2').slots) {
        const player = squad.find((c) => c.player.id === lineup.starters[slot.id])!.player;
        slots++;
        if (positionFit(player, slot.position) === 'unfamiliar') unfamiliar++;
      }
    }
    expect(unfamiliar / slots).toBeLessThan(0.05);
  });

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

describe('swapPlaces (tap one, tap another)', () => {
  const slot = (slotId: string) => ({ kind: 'slot', slotId }) as const;
  const bench = (playerId: string) => ({ kind: 'bench', playerId }) as const;

  it('swaps two starters, in either order', () => {
    const lineup = picked();
    const { LB, RB } = lineup.starters;
    for (const next of [swapPlaces(lineup, slot('LB'), slot('RB')), swapPlaces(lineup, slot('RB'), slot('LB'))]) {
      expect(next.starters.LB).toBe(RB);
      expect(next.starters.RB).toBe(LB);
      expect(next.substitutes).toEqual(lineup.substitutes);
    }
  });

  it('swaps a starter and a substitute, who change places on the bench too', () => {
    const lineup = picked();
    const sub = lineup.substitutes[3];
    const starter = lineup.starters.RM!;
    for (const next of [swapPlaces(lineup, slot('RM'), bench(sub)), swapPlaces(lineup, bench(sub), slot('RM'))]) {
      expect(next.starters.RM).toBe(sub);
      expect(next.substitutes[3]).toBe(starter);
      expect(next.substitutes).toHaveLength(lineup.substitutes.length);
    }
  });

  it('moves a starter into an empty slot (either way round), leaving his old slot empty', () => {
    const lineup = clearSlot(picked(), 'LM');
    const rm = lineup.starters.RM!;
    for (const next of [swapPlaces(lineup, slot('RM'), slot('LM')), swapPlaces(lineup, slot('LM'), slot('RM'))]) {
      expect(next.starters.LM).toBe(rm);
      expect(next.starters.RM).toBeNull();
    }
  });

  it('a substitute fills an empty slot and leaves the bench', () => {
    const lineup = clearSlot(picked(), 'GK');
    const keeper = lineup.substitutes[0];
    const next = swapPlaces(lineup, slot('GK'), bench(keeper));
    expect(next.starters.GK).toBe(keeper);
    expect(next.substitutes).not.toContain(keeper);
  });

  it('reorders the bench, and leaves the lineup alone for the same place twice', () => {
    const lineup = picked();
    const [first, second] = lineup.substitutes;
    const next = swapPlaces(lineup, bench(first), bench(second));
    expect(next.substitutes.slice(0, 2)).toEqual([second, first]);
    expect(swapPlaces(lineup, slot('GK'), slot('GK'))).toBe(lineup);
  });

  it('never loses or duplicates a player, and refuses places that are not in the lineup', () => {
    const lineup = picked();
    const before = [...starterIds(lineup), ...lineup.substitutes].sort();
    const next = swapPlaces(swapPlaces(lineup, slot('GK'), slot('LST')), bench(lineup.substitutes[1]), slot('LCM'));
    expect([...starterIds(next), ...next.substitutes].sort()).toEqual(before);
    expect(() => swapPlaces(lineup, slot('GK'), bench(aReserve(lineup)))).toThrow(RangeError);
    expect(() => swapPlaces(lineup, slot('GK'), slot('DM'))).toThrow(RangeError);
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

describe('validateLineup with availability (Milestone 8)', () => {
  const db8 = buildFictionalDatabase();
  const squad8 = selectSquadCandidates(db8, 'club_greywater_town');
  const picked = autoPickLineup(squad8, '4-4-2');
  const striker = picked.starters.LST!;
  const sub = picked.substitutes[0];

  it('an injured starter or substitute is an error', () => {
    const issues = validateLineup(picked, squad8, { isInjured: (id) => id === striker || id === sub, fitnessOf: () => 100 });
    const injured = issues.filter((i) => i.code === 'injured');
    expect(injured.map((i) => i.playerId).sort()).toEqual([striker, sub].sort());
    expect(injured.every((i) => i.severity === 'error')).toBe(true);
  });

  it('a tired starter is a warning, a fit one is not', () => {
    const issues = validateLineup(picked, squad8, { isInjured: () => false, fitnessOf: (id) => (id === striker ? LOW_FITNESS - 5 : 95) });
    expect(issues.filter((i) => i.code === 'low-fitness')).toEqual([expect.objectContaining({ playerId: striker, severity: 'warning' })]);
  });

  it('without availability nothing changes', () => {
    expect(validateLineup(picked, squad8).some((i) => i.code === 'injured' || i.code === 'low-fitness')).toBe(false);
  });
});
