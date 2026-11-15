import type { AttributeKey, Position } from '@/data/schemas';

import { getFormation } from '../formations';
import type { Lineup, LineupCandidate } from '../lineup';
import { flattenAttributes } from '../ratings';
import type { Tactics } from './tactics';

/**
 * The assistant manager's view: short notes comparing the tactics with the
 * players actually selected. Pure function, so every rule is unit-tested.
 *
 * Two kinds of rule:
 *  - Consistency: instructions that pull against each other (no player data).
 *  - Suitability: does the unit an instruction relies on have the attributes
 *    for it? Average below WEAK → warning; at or above STRONG → positive.
 *
 * Units are chosen by the *slot* a player fills in this formation, not their
 * natural position: a striker playing centre-back is judged as a centre-back.
 */

export type TacticalNote = {
  id: string;
  tone: 'positive' | 'warning';
  message: string;
};

export const WEAK = 10;
export const STRONG = 14;

const CENTRE_BACKS: readonly Position[] = ['CB'];
const MIDFIELD: readonly Position[] = ['DM', 'CM', 'AM'];
const WIDE: readonly Position[] = ['RB', 'LB', 'RWB', 'LWB', 'RM', 'LM', 'RW', 'LW'];
const STRIKERS: readonly Position[] = ['ST'];

export function analyseTactics(
  tactics: Tactics,
  lineup: Lineup,
  candidates: readonly LineupCandidate[],
): TacticalNote[] {
  const notes: TacticalNote[] = [...consistencyNotes(tactics)];

  // Attribute lookups for each filled slot, tagged with the slot's position.
  const byId = new Map(candidates.map((c) => [c.player.id, c]));
  const xi = getFormation(lineup.formationId).slots.flatMap((slot) => {
    const id = lineup.starters[slot.id];
    const candidate = id ? byId.get(id) : undefined;
    return candidate ? [{ position: slot.position, attrs: flattenAttributes(candidate.attributes) }] : [];
  });
  /** Average of `keys` over the players in `positions` (or the whole XI); null if nobody is there. */
  const unitAverage = (keys: readonly AttributeKey[], positions?: readonly Position[]): number | null => {
    const unit = positions ? xi.filter((p) => positions.includes(p.position)) : xi;
    if (unit.length === 0) return null;
    const total = unit.reduce((sum, p) => sum + keys.reduce((s, k) => s + p.attrs[k], 0) / keys.length, 0);
    return total / unit.length;
  };
  const judge = (id: string, value: number | null, weak: string, strong: string) => {
    if (value === null) return;
    if (value < WEAK) notes.push({ id, tone: 'warning', message: weak.replace('{avg}', value.toFixed(1)) });
    else if (value >= STRONG) notes.push({ id, tone: 'positive', message: strong.replace('{avg}', value.toFixed(1)) });
  };

  if (tactics.defensiveLine === 'high') {
    judge(
      'high-line-pace',
      unitAverage(['pace', 'acceleration'], CENTRE_BACKS),
      'Your centre-backs lack pace (avg {avg}). A high line leaves space in behind them.',
      'Quick centre-backs (avg {avg}) can cover the space behind a high line.',
    );
  }

  if (tactics.pressing === 'high') {
    judge(
      'pressing-fitness',
      unitAverage(['stamina', 'workRate']),
      'The team lacks the stamina and work rate to press high for 90 minutes (avg {avg}).',
      'Your XI has the engine to press high (stamina and work rate avg {avg}).',
    );
  }

  if (tactics.passing === 'short' || tactics.tempo === 'slow') {
    judge(
      'possession-technique',
      unitAverage(['passing', 'firstTouch', 'composure'], MIDFIELD),
      'Patient passing needs a technical midfield. Yours may give the ball away (avg {avg}).',
      'Your midfield is comfortable on the ball (avg {avg}), which suits patient passing.',
    );
  }

  if (tactics.width === 'wide') {
    judge(
      'width-crossing',
      unitAverage(['crossing'], WIDE),
      'Playing wide relies on crossing, and your wide players are weak at it (avg {avg}).',
      'Your wide players are good crossers (avg {avg}), so playing wide suits them.',
    );
  }

  if (tactics.passing === 'direct') {
    const aerial = unitAverage(['heading', 'strength'], STRIKERS);
    const pace = unitAverage(['pace', 'acceleration'], STRIKERS);
    const target = aerial === null || pace === null ? null : Math.max(aerial, pace);
    judge(
      'direct-target',
      target,
      'Direct balls need a target, but your strikers are neither strong in the air nor quick (best avg {avg}).',
      'Your strikers can win or chase direct balls (best avg {avg}).',
    );
  }

  // Warnings first: they're what the manager needs to act on.
  return notes.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'warning' ? -1 : 1));
}

function consistencyNotes(t: Tactics): TacticalNote[] {
  const notes: TacticalNote[] = [];
  const warn = (id: string, message: string) => notes.push({ id, tone: 'warning', message });

  if (t.pressing === 'high' && t.defensiveLine === 'deep') {
    warn('press-deep', 'Pressing high while defending deep stretches the team and leaves gaps between the lines.');
  }
  if ((t.mentality === 'attacking' || t.mentality === 'very-attacking') && t.defensiveLine === 'deep') {
    warn('attack-deep', 'An attacking mentality with a deep line leaves a big gap between defence and attack.');
  }
  if ((t.mentality === 'defensive' || t.mentality === 'very-defensive') && t.defensiveLine === 'high') {
    warn('defend-high', 'A defensive mentality with a high line is contradictory: the team sits back but leaves space behind.');
  }
  if (t.passing === 'direct' && t.tempo === 'slow') {
    warn('direct-slow', 'Direct passing works best at a quicker tempo. Slow build-up gives the opponent time to organise.');
  }
  return notes;
}
