import { z } from 'zod';

import { IsoDateSchema, PlayerIdSchema, type ClubId, type GameDatabase, type PlayerId } from '@/data/schemas';
import { NEUTRAL_MORALE } from '@/engine/team-state';
import type { MatchResult, PlayerMatchCondition, Side } from '@/engine/types';
import { addDays, daysBetween } from '@/utils/date';

/**
 * Player condition between matches: fitness, morale and injuries (Milestone 8a).
 *
 * Stored SPARSELY: only players who differ from "fit, neutral morale, not
 * injured" have an entry, so a save holds dozens of records, not 880.
 *
 * Recovery is LAZY: the state remembers the date it describes, and
 * `conditionOn(state, date)` applies the days in between in one step. Nothing
 * has to tick daily. Fitness and injuries come out the same however the days
 * are split up (tested); morale rounds each step, so it can differ by a point.
 */

export const InjurySchema = z.strictObject({
  name: z.string().min(1),
  /** First day he's available again. */
  returns: IsoDateSchema,
});
export type Injury = z.infer<typeof InjurySchema>;

export const PlayerConditionSchema = z.strictObject({
  /** 0–100: his starting energy in the next match. */
  fitness: z.int().min(0).max(100),
  /** 0–100: neutral is NEUTRAL_MORALE (60). */
  morale: z.int().min(0).max(100),
  injury: InjurySchema.nullable(),
});
export type PlayerCondition = z.infer<typeof PlayerConditionSchema>;

export const ConditionStateSchema = z.strictObject({
  date: IsoDateSchema,
  players: z.record(PlayerIdSchema, PlayerConditionSchema),
});
export type ConditionState = z.infer<typeof ConditionStateSchema>;

export { NEUTRAL_MORALE };
export const FULLY_FIT: PlayerCondition = { fitness: 100, morale: NEUTRAL_MORALE, injury: null };

/** Fitness regained per day: a 90-minute player (~65) is back to ~93 four days later, 100 a week later. */
export const RECOVERY_PER_DAY = 7;
/** Share of the gap to neutral morale that closes each day (~19% a week). */
const MORALE_REVERSION_PER_DAY = 0.03;
/** Below this, AI clubs rest a starter if they can. */
export const ROTATION_FITNESS = 80;
/** Below this, the user's lineup shows a warning. */
export const LOW_FITNESS = 75;

const RESULT_MORALE = { win: 4, draw: 1, loss: -4 } as const;
/** In the squad but didn't play. */
const LEFT_OUT_MORALE = -2;

export const emptyConditions = (date: string): ConditionState => ({ date, players: {} });

export function conditionOf(state: ConditionState, playerId: PlayerId): PlayerCondition {
  return state.players[playerId] ?? FULLY_FIT;
}

export const isInjured = (state: ConditionState, playerId: PlayerId) => conditionOf(state, playerId).injury !== null;

const isDefault = (c: PlayerCondition) => c.fitness === 100 && c.morale === NEUTRAL_MORALE && c.injury === null;
const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Rebuilds the sparse map, dropping players who are back to default. */
function withPlayers(date: string, entries: Iterable<[PlayerId, PlayerCondition]>): ConditionState {
  const players: Record<PlayerId, PlayerCondition> = {};
  for (const [id, c] of entries) if (!isDefault(c)) players[id] = c;
  return { date, players };
}

/** Morale after `days` drifting back towards neutral; always moves at least 1 point so it settles exactly. */
function revertMorale(morale: number, days: number): number {
  const gap = NEUTRAL_MORALE - morale;
  if (gap === 0 || days <= 0) return morale;
  const step = Math.max(1, Math.round(Math.abs(gap) * (1 - (1 - MORALE_REVERSION_PER_DAY) ** days)));
  return morale + Math.sign(gap) * Math.min(step, Math.abs(gap));
}

/** The state on a later date: fitness recovers, morale settles, injuries heal. Earlier dates return it unchanged. */
export function conditionOn(state: ConditionState, date: string): ConditionState {
  const days = daysBetween(state.date, date);
  if (days <= 0) return state;
  return withPlayers(
    date,
    Object.entries(state.players).map(([id, c]): [PlayerId, PlayerCondition] => [
      id,
      {
        fitness: Math.min(100, c.fitness + RECOVERY_PER_DAY * days),
        morale: revertMorale(c.morale, days),
        injury: c.injury && c.injury.returns > date ? c.injury : null,
      },
    ]),
  );
}

/**
 * Cached per state object: every team on a matchday asks for the same map,
 * and states are immutable, so a WeakMap (like the AI setup cache) can't go
 * stale. Measured: building it per team cost ~0.8 s over a season.
 */
const engineInputCache = new WeakMap<ConditionState, Record<PlayerId, PlayerMatchCondition>>();

/** What the engine needs: starting fitness and morale for every player with a non-default condition. */
export function matchConditions(state: ConditionState): Record<PlayerId, PlayerMatchCondition> {
  const cached = engineInputCache.get(state);
  if (cached) return cached;
  const out: Record<PlayerId, PlayerMatchCondition> = {};
  for (const [id, c] of Object.entries(state.players)) out[id] = { fitness: c.fitness, morale: c.morale };
  engineInputCache.set(state, out);
  return out;
}

export function adjustMorale(state: ConditionState, playerId: PlayerId, delta: number): ConditionState {
  const c = conditionOf(state, playerId);
  return withPlayers(state.date, [...Object.entries(state.players), [playerId, { ...c, morale: clampScore(c.morale + delta) }]]);
}

/** Lookups for code that shouldn't depend on the condition record's shape (lineup validation, views). */
export type Availability = {
  isInjured: (id: PlayerId) => boolean;
  fitnessOf: (id: PlayerId) => number;
  isSuspended: (id: PlayerId) => boolean;
};

/** Condition plus (optionally) the players banned from the match in question. */
export function availabilityFrom(state: ConditionState, suspended: ReadonlySet<PlayerId> = new Set()): Availability {
  return {
    isInjured: (id) => isInjured(state, id),
    fitnessOf: (id) => conditionOf(state, id).fitness,
    isSuspended: (id) => suspended.has(id),
  };
}

// --- After a match ------------------------------------------------------------------

const INJURY_NAMES = {
  knock: ['dead leg', 'ankle knock', 'bruised ribs', 'tight calf'],
  strain: ['hamstring strain', 'calf strain', 'groin strain', 'twisted ankle', 'thigh strain'],
  serious: ['knee ligament damage', 'broken foot', 'torn hamstring', 'dislocated shoulder'],
} as const;

/** A deterministic name for an injury of `days` (same player + days → same name). */
export function injuryName(playerId: PlayerId, days: number): string {
  const names = days <= 10 ? INJURY_NAMES.knock : days <= 28 ? INJURY_NAMES.strain : INJURY_NAMES.serious;
  let h = days;
  for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) >>> 0;
  return names[h % names.length];
}

export type NewInjury = { playerId: PlayerId; clubId: ClubId; injury: Injury; days: number };

function ratingMorale(rating: number): number {
  if (rating >= 7.5) return 3;
  if (rating >= 7) return 1;
  if (rating < 6) return -2;
  return 0;
}

/** Contracted player ids per club, for "left out" morale. */
export function squadIds(db: GameDatabase, clubId: ClubId): PlayerId[] {
  return db.contracts.filter((c) => c.clubId === clubId).map((c) => c.playerId);
}

/**
 * Applies a finished match on `date` (the state must already be on that date):
 * players' fitness becomes their final energy, morale moves with the result
 * and their rating, squad players left out lose a little, and injuries start.
 */
export function applyMatch(
  state: ConditionState,
  result: MatchResult,
  squads: Record<Side, readonly PlayerId[]>,
  date: string,
): { state: ConditionState; injuries: NewInjury[] } {
  if (state.date !== date) throw new RangeError(`Condition is on ${state.date}, match on ${date}`);
  const players = new Map(Object.entries(state.players));
  const get = (id: PlayerId) => players.get(id) ?? FULLY_FIT;

  const outcome = (side: Side): keyof typeof RESULT_MORALE => {
    const own = result.score[side];
    const other = result.score[side === 'home' ? 'away' : 'home'];
    return own > other ? 'win' : own < other ? 'loss' : 'draw';
  };

  const played = new Set<PlayerId>();
  for (const line of result.players) {
    played.add(line.playerId);
    const c = get(line.playerId);
    players.set(line.playerId, {
      ...c,
      fitness: clampScore(line.energy),
      morale: clampScore(c.morale + RESULT_MORALE[outcome(line.side)] + ratingMorale(line.rating)),
    });
  }
  for (const side of ['home', 'away'] as const) {
    for (const id of squads[side]) {
      const c = get(id);
      if (played.has(id) || c.injury) continue;
      players.set(id, { ...c, morale: clampScore(c.morale + LEFT_OUT_MORALE) });
    }
  }

  const injuries: NewInjury[] = [];
  for (const event of result.events) {
    if (event.type !== 'injury') continue;
    const injury = { name: injuryName(event.playerId, event.days), returns: addDays(date, event.days) };
    players.set(event.playerId, { ...get(event.playerId), injury });
    injuries.push({ playerId: event.playerId, clubId: result[event.side].clubId, injury, days: event.days });
  }
  return { state: withPlayers(date, players), injuries };
}

// --- Labels for the UI ------------------------------------------------------------------

export function moraleLabel(morale: number): string {
  if (morale >= 85) return 'Superb';
  if (morale >= 68) return 'Good';
  if (morale >= 50) return 'Okay';
  if (morale >= 30) return 'Low';
  return 'Very low';
}
