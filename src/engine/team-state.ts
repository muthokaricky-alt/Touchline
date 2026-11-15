import type { AttributeKey, PlayerId, Position } from '@/data/schemas';
import { getFormation } from '@/game/formations';
import type { LineupCandidate } from '@/game/lineup';
import { flattenAttributes } from '@/game/ratings';
import { effectiveRating, positionFit, type PositionFit } from '@/game/squad/position-fit';

import { tacticalEffects, type TacticalEffects } from './tactical-effects';
import type { MatchTeamInput, Side } from './types';

/**
 * Mutable per-team state during ONE simulation. It never escapes
 * `simulateMatch`, which returns plain, immutable result data.
 */

export type OnPitch = {
  id: PlayerId;
  /** Slot position in the formation (what they're being asked to do). */
  position: Position;
  attrs: Record<AttributeKey, number>;
  fit: PositionFit;
  /** 0–100. Drains every minute. */
  energy: number;
  booked: boolean;
};

export type TeamState = {
  side: Side;
  input: MatchTeamInput;
  effects: TacticalEffects;
  onPitch: OnPitch[];
  /** Substitutes not yet used. */
  bench: LineupCandidate[];
  subsUsed: number;
};

export const MAX_SUBS = 5;

/** Playing out of position reduces every attribute a little. */
const FIT_FACTOR: Record<PositionFit, number> = { natural: 1, accomplished: 0.93, unfamiliar: 0.8 };

export function toOnPitch(candidate: LineupCandidate, position: Position): OnPitch {
  return {
    id: candidate.player.id,
    position,
    attrs: flattenAttributes(candidate.attributes),
    fit: positionFit(candidate.player, position),
    energy: 100,
    booked: false,
  };
}

export function createTeamState(side: Side, input: MatchTeamInput): TeamState {
  const byId = new Map(input.squad.map((c) => [c.player.id, c]));
  const onPitch = getFormation(input.lineup.formationId).slots.flatMap((slot) => {
    const id = input.lineup.starters[slot.id];
    const candidate = id ? byId.get(id) : undefined;
    return candidate ? [toOnPitch(candidate, slot.position)] : [];
  });
  const bench = input.lineup.substitutes.flatMap((id) => {
    const candidate = byId.get(id);
    return candidate ? [candidate] : [];
  });
  return { side, input, effects: tacticalEffects(input.tactics), onPitch, bench, subsUsed: 0 };
}

/**
 * An attribute as it counts *right now*: base value × position familiarity ×
 * tiredness. A fresh player counts 100%; at 0 energy, 70%.
 */
export function value(p: OnPitch, key: AttributeKey): number {
  return p.attrs[key] * FIT_FACTOR[p.fit] * (0.7 + 0.3 * (p.energy / 100));
}

export function average(p: OnPitch, keys: readonly AttributeKey[]): number {
  return keys.reduce((sum, k) => sum + value(p, k), 0) / keys.length;
}

// ---------------------------------------------------------------------------
// Unit strengths (on the 1–20 scale)
// ---------------------------------------------------------------------------

type RoleWeights = Partial<Record<Position, number>>;

const CONTROL_WEIGHTS: RoleWeights = {
  DM: 1, CM: 1, AM: 1, RM: 0.8, LM: 0.8, RW: 0.5, LW: 0.5, RB: 0.5, LB: 0.5, RWB: 0.6, LWB: 0.6, CB: 0.4, ST: 0.35,
};
const ATTACK_WEIGHTS: RoleWeights = {
  ST: 1, AM: 0.9, RW: 0.9, LW: 0.9, RM: 0.6, LM: 0.6, CM: 0.4, RWB: 0.3, LWB: 0.3, DM: 0.15, RB: 0.15, LB: 0.15,
};
const DEFENCE_WEIGHTS: RoleWeights = {
  CB: 1, RB: 0.9, LB: 0.9, RWB: 0.7, LWB: 0.7, DM: 0.8, CM: 0.4, RM: 0.25, LM: 0.25, AM: 0.15, RW: 0.15, LW: 0.15, ST: 0.1,
};

const CONTROL_KEYS: readonly AttributeKey[] = ['passing', 'firstTouch', 'vision', 'decisions', 'composure'];
const ATTACK_KEYS: readonly AttributeKey[] = ['finishing', 'dribbling', 'pace', 'anticipation', 'composure', 'firstTouch'];
const DEFENCE_KEYS: readonly AttributeKey[] = ['tackling', 'marking', 'positioning', 'heading', 'anticipation', 'strength'];

function unitStrength(team: TeamState, weights: RoleWeights, keys: readonly AttributeKey[]): number {
  let total = 0;
  let weightSum = 0;
  for (const p of team.onPitch) {
    const w = weights[p.position] ?? 0;
    if (w === 0) continue;
    total += w * average(p, keys);
    weightSum += w;
  }
  const quality = weightSum > 0 ? total / weightSum : 1;
  // Fewer than 11 players (red cards) → proportionally weaker.
  return quality * (team.onPitch.length / 11);
}

export const controlStrength = (t: TeamState) => unitStrength(t, CONTROL_WEIGHTS, CONTROL_KEYS);
export const attackStrength = (t: TeamState) => unitStrength(t, ATTACK_WEIGHTS, ATTACK_KEYS);
export const defenceStrength = (t: TeamState) => unitStrength(t, DEFENCE_WEIGHTS, DEFENCE_KEYS);

export function goalkeeper(team: TeamState): OnPitch | undefined {
  return team.onPitch.find((p) => p.position === 'GK');
}

/** Average of `keys` over players in `positions`; falls back to the whole team, then 10. */
export function positionalAverage(team: TeamState, positions: readonly Position[], keys: readonly AttributeKey[]): number {
  const unit = team.onPitch.filter((p) => positions.includes(p.position));
  const pool = unit.length > 0 ? unit : team.onPitch.filter((p) => p.position !== 'GK');
  if (pool.length === 0) return 10;
  return pool.reduce((sum, p) => sum + average(p, keys), 0) / pool.length;
}

// ---------------------------------------------------------------------------
// Fatigue
// ---------------------------------------------------------------------------

/**
 * Energy lost per minute. Stamina 20 → ~21 over 90 minutes, stamina 5 → ~42,
 * scaled by tactics (pressing, tempo). Goalkeepers barely tire.
 */
export function drainEnergy(team: TeamState): void {
  for (const p of team.onPitch) {
    const perMinute = (0.55 - 0.016 * p.attrs.stamina) * team.effects.energyDrain * (p.position === 'GK' ? 0.3 : 1);
    p.energy = Math.max(0, p.energy - perMinute);
  }
}

/** Best unused bench player for a position, or undefined. Keepers only replace keepers. */
export function bestReplacement(team: TeamState, position: Position): LineupCandidate | undefined {
  const pool = team.bench.filter((c) => (position === 'GK') === (c.player.primaryPosition === 'GK'));
  let best: LineupCandidate | undefined;
  let bestScore = -Infinity;
  for (const c of pool) {
    const score = effectiveRating(c.player, c.attributes, position);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
