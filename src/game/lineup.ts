import { z } from 'zod';

import { PlayerIdSchema, type Player, type PlayerAttributes, type PlayerId } from '@/data/schemas';

import { findSlot, FormationIdSchema, getFormation, type FormationId, type FormationSlot } from './formations';
import { effectiveRating, positionFit } from './squad/position-fit';

/**
 * A team selection: a formation, who plays in each of its slots, and who's
 * on the bench. Everyone else in the squad is a reserve.
 *
 * Every function here is *immutable*: it returns a new Lineup and never
 * edits the one passed in. React and Zustand detect changes by comparing
 * object references, so mutating in place would leave the screen stale.
 */

export const BENCH_SIZE = 7;

export const LineupSchema = z.strictObject({
  formationId: FormationIdSchema,
  /** slot id → player id, or null for an empty slot. */
  starters: z.record(z.string(), PlayerIdSchema.nullable()),
  substitutes: z.array(PlayerIdSchema).max(BENCH_SIZE),
});

export type Lineup = z.infer<typeof LineupSchema>;

/** A player the lineup can choose from: identity + attributes. */
export type LineupCandidate = { player: Player; attributes: PlayerAttributes };

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function emptyLineup(formationId: FormationId): Lineup {
  const starters = Object.fromEntries(getFormation(formationId).slots.map((s) => [s.id, null]));
  return { formationId, starters, substitutes: [] };
}

/** The slot a player starts in, or null if they're not starting. */
export function startingSlotOf(lineup: Lineup, playerId: PlayerId): string | null {
  const entry = Object.entries(lineup.starters).find(([, id]) => id === playerId);
  return entry ? entry[0] : null;
}

export function starterIds(lineup: Lineup): PlayerId[] {
  return Object.values(lineup.starters).filter((id): id is PlayerId => id !== null);
}

export function isBenchFull(lineup: Lineup): boolean {
  return lineup.substitutes.length >= BENCH_SIZE;
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

/**
 * Puts a player in a slot. Whoever was there swaps to where the incoming
 * player came from: another slot, their bench place, or (if the incoming
 * player was a reserve) out of the lineup.
 */
export function assignToSlot(lineup: Lineup, slotId: string, playerId: PlayerId): Lineup {
  assertSlotExists(lineup, slotId);
  const displaced = lineup.starters[slotId] ?? null;
  if (displaced === playerId) return lineup;

  const starters = { ...lineup.starters };
  const substitutes = [...lineup.substitutes];
  const fromSlot = startingSlotOf(lineup, playerId);
  const benchIndex = substitutes.indexOf(playerId);

  if (fromSlot) {
    starters[fromSlot] = displaced;
  } else if (benchIndex !== -1) {
    if (displaced) substitutes[benchIndex] = displaced;
    else substitutes.splice(benchIndex, 1);
  }
  starters[slotId] = playerId;
  return { ...lineup, starters, substitutes };
}

export function clearSlot(lineup: Lineup, slotId: string): Lineup {
  assertSlotExists(lineup, slotId);
  if (lineup.starters[slotId] === null) return lineup;
  return { ...lineup, starters: { ...lineup.starters, [slotId]: null } };
}

/** Adds a player to the bench (taking them out of the XI if they were starting). */
export function addSubstitute(lineup: Lineup, playerId: PlayerId): Lineup {
  if (lineup.substitutes.includes(playerId)) return lineup;
  if (isBenchFull(lineup)) throw new RangeError(`The bench is full (${BENCH_SIZE} players)`);

  const starters = { ...lineup.starters };
  const fromSlot = startingSlotOf(lineup, playerId);
  if (fromSlot) starters[fromSlot] = null;
  return { ...lineup, starters, substitutes: [...lineup.substitutes, playerId] };
}

/** Removes a player from the XI or bench, making them a reserve. */
export function removeFromLineup(lineup: Lineup, playerId: PlayerId): Lineup {
  const fromSlot = startingSlotOf(lineup, playerId);
  const onBench = lineup.substitutes.includes(playerId);
  if (!fromSlot && !onBench) return lineup;

  return {
    ...lineup,
    starters: fromSlot ? { ...lineup.starters, [fromSlot]: null } : lineup.starters,
    substitutes: lineup.substitutes.filter((id) => id !== playerId),
  };
}

/**
 * Switches formation and re-seats the *current* starters in the new slots
 * as sensibly as possible. The bench is untouched.
 */
export function changeFormation(lineup: Lineup, formationId: FormationId, candidates: readonly LineupCandidate[]): Lineup {
  if (formationId === lineup.formationId) return lineup;
  const current = new Set(starterIds(lineup));
  const pool = candidates.filter((c) => current.has(c.player.id));
  return { ...lineup, formationId, starters: assignBestPlayers(getFormation(formationId).slots, pool) };
}

/**
 * Picks the strongest XI for a formation, then a bench of the best remaining
 * players with a backup goalkeeper first.
 */
export function autoPickLineup(candidates: readonly LineupCandidate[], formationId: FormationId): Lineup {
  const starters = assignBestPlayers(getFormation(formationId).slots, candidates);
  const starting = new Set(Object.values(starters));

  const remaining = candidates
    .filter((c) => !starting.has(c.player.id))
    .sort((a, b) => primaryRating(b) - primaryRating(a) || compareIds(a, b));

  const substitutes: PlayerId[] = [];
  const backupKeeper = remaining.find((c) => c.player.primaryPosition === 'GK');
  if (backupKeeper) substitutes.push(backupKeeper.player.id);
  for (const c of remaining) {
    if (substitutes.length >= BENCH_SIZE) break;
    if (c.player.primaryPosition !== 'GK') substitutes.push(c.player.id);
  }

  return { formationId, starters, substitutes };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type LineupIssueCode =
  | 'unknown-slot'
  | 'empty-slot'
  | 'unknown-player'
  | 'duplicate-player'
  | 'bench-too-large'
  | 'no-goalkeeper'
  | 'out-of-position';

/** Errors make a lineup unplayable; warnings are allowed but worth showing. */
export type LineupIssue = {
  severity: 'error' | 'warning';
  code: LineupIssueCode;
  message: string;
  slotId?: string;
  playerId?: PlayerId;
};

export function validateLineup(lineup: Lineup, candidates: readonly LineupCandidate[]): LineupIssue[] {
  const issues: LineupIssue[] = [];
  const formation = getFormation(lineup.formationId);
  const byId = new Map(candidates.map((c) => [c.player.id, c]));
  const nameOf = (c: LineupCandidate) => `${c.player.firstName} ${c.player.lastName}`;

  for (const slotId of Object.keys(lineup.starters)) {
    if (!findSlot(formation, slotId)) {
      issues.push({ severity: 'error', code: 'unknown-slot', slotId, message: `${slotId} isn't part of ${formation.id}` });
    }
  }

  for (const slot of formation.slots) {
    const playerId = lineup.starters[slot.id] ?? null;
    if (!playerId) {
      issues.push({ severity: 'error', code: 'empty-slot', slotId: slot.id, message: `No one is playing at ${slot.id}` });
      continue;
    }
    const candidate = byId.get(playerId);
    if (!candidate) {
      issues.push({ severity: 'error', code: 'unknown-player', slotId: slot.id, playerId, message: `${playerId} isn't in your squad` });
      continue;
    }
    const fit = positionFit(candidate.player, slot.position);
    if (slot.position === 'GK' && fit !== 'natural') {
      issues.push({ severity: 'warning', code: 'no-goalkeeper', slotId: slot.id, playerId, message: `${nameOf(candidate)} isn't a goalkeeper` });
    } else if (fit === 'unfamiliar') {
      issues.push({ severity: 'warning', code: 'out-of-position', slotId: slot.id, playerId, message: `${nameOf(candidate)} is out of position at ${slot.id}` });
    }
  }

  for (const playerId of lineup.substitutes) {
    if (!byId.has(playerId)) {
      issues.push({ severity: 'error', code: 'unknown-player', playerId, message: `${playerId} isn't in your squad` });
    }
  }

  const selected = [...formation.slots.map((s) => lineup.starters[s.id] ?? null), ...lineup.substitutes];
  const seen = new Set<PlayerId>();
  for (const playerId of selected) {
    if (!playerId) continue;
    if (seen.has(playerId)) {
      issues.push({ severity: 'error', code: 'duplicate-player', playerId, message: `${playerId} is selected more than once` });
    }
    seen.add(playerId);
  }

  if (lineup.substitutes.length > BENCH_SIZE) {
    issues.push({ severity: 'error', code: 'bench-too-large', message: `Only ${BENCH_SIZE} substitutes are allowed` });
  }

  return issues;
}

export function isLineupPlayable(issues: readonly LineupIssue[]): boolean {
  return issues.every((issue) => issue.severity !== 'error');
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Greedy assignment: fill the hardest-to-fill slots first (fewest natural
 * candidates per slot of that position), each with the best remaining
 * player by effective rating. Not guaranteed optimal, but fast, predictable
 * and good enough for an assistant-manager "pick my team" button.
 */
function assignBestPlayers(
  slots: readonly FormationSlot[],
  pool: readonly LineupCandidate[],
): Record<string, PlayerId | null> {
  const starters: Record<string, PlayerId | null> = Object.fromEntries(slots.map((s) => [s.id, null]));
  const scarcity = (slot: FormationSlot) => {
    const naturals = pool.filter((c) => positionFit(c.player, slot.position) === 'natural').length;
    const sameSlots = slots.filter((s) => s.position === slot.position).length;
    return naturals / sameSlots;
  };
  const order = slots
    .map((slot, index) => ({ slot, index, scarcity: scarcity(slot) }))
    .sort((a, b) => a.scarcity - b.scarcity || a.index - b.index);

  const used = new Set<PlayerId>();
  for (const { slot } of order) {
    let best: LineupCandidate | null = null;
    let bestScore = -Infinity;
    for (const candidate of pool) {
      if (used.has(candidate.player.id)) continue;
      const score = effectiveRating(candidate.player, candidate.attributes, slot.position);
      if (score > bestScore || (score === bestScore && best && compareIds(candidate, best) < 0)) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best) {
      starters[slot.id] = best.player.id;
      used.add(best.player.id);
    }
  }
  return starters;
}

function primaryRating(c: LineupCandidate): number {
  return effectiveRating(c.player, c.attributes, c.player.primaryPosition);
}

/** Tie-breaker so results never depend on input order quirks. */
function compareIds(a: LineupCandidate, b: LineupCandidate): number {
  return a.player.id < b.player.id ? -1 : a.player.id > b.player.id ? 1 : 0;
}

function assertSlotExists(lineup: Lineup, slotId: string): void {
  if (!findSlot(getFormation(lineup.formationId), slotId)) {
    throw new RangeError(`Slot "${slotId}" doesn't exist in formation ${lineup.formationId}`);
  }
}
