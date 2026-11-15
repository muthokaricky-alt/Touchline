import type { ClubId, GameDatabase, PlayerId, Position } from '@/data/schemas';

import { findSlot, getFormation, type FormationId } from '../formations';
import { BENCH_SIZE, isBenchFull, startingSlotOf, validateLineup, type Lineup, type LineupIssue } from '../lineup';
import { effectiveRating, positionFit, type PositionFit } from './position-fit';
import { fullName, selectSquadCandidates, shortName } from './squad-selectors';

/** View models for the team selection (pitch) screen and the player picker. */

export type LineupPlayerView = {
  id: PlayerId;
  shortName: string;
  lastName: string;
  squadNumber: number | null;
  primaryPosition: Position;
  /** Rounded effective rating where they're placed (bench: primary position). */
  rating: number;
  fit: PositionFit;
};

export type TeamSheetSlotView = {
  slotId: string;
  position: Position;
  x: number;
  y: number;
  player: LineupPlayerView | null;
};

export type TeamSheetView = {
  formationId: FormationId;
  slots: TeamSheetSlotView[];
  substitutes: LineupPlayerView[];
  benchSize: number;
  benchFull: boolean;
  /** Average rating of the filled slots, rounded to 1 decimal; null if the XI is empty. */
  averageRating: number | null;
  issues: LineupIssue[];
};

export function selectTeamSheet(db: GameDatabase, clubId: ClubId, lineup: Lineup): TeamSheetView {
  const candidates = selectSquadCandidates(db, clubId);
  const byId = new Map(candidates.map((c) => [c.player.id, c]));
  const numbers = new Map(db.contracts.map((c) => [c.playerId, c.squadNumber]));

  const toView = (playerId: PlayerId, position: Position): LineupPlayerView | null => {
    const candidate = byId.get(playerId);
    if (!candidate) return null;
    const { player, attributes } = candidate;
    return {
      id: player.id,
      shortName: shortName(player),
      lastName: player.lastName,
      squadNumber: numbers.get(player.id) ?? null,
      primaryPosition: player.primaryPosition,
      rating: Math.round(effectiveRating(player, attributes, position)),
      fit: positionFit(player, position),
    };
  };

  const slots = getFormation(lineup.formationId).slots.map((slot) => {
    const playerId = lineup.starters[slot.id] ?? null;
    return { slotId: slot.id, position: slot.position, x: slot.x, y: slot.y, player: playerId ? toView(playerId, slot.position) : null };
  });

  const substitutes = lineup.substitutes.flatMap((id) => {
    const candidate = byId.get(id);
    const view = candidate ? toView(id, candidate.player.primaryPosition) : null;
    return view ? [view] : [];
  });

  const ratings = slots.flatMap((s) => (s.player ? [s.player.rating] : []));
  const averageRating = ratings.length
    ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10
    : null;

  return {
    formationId: lineup.formationId,
    slots,
    substitutes,
    benchSize: BENCH_SIZE,
    benchFull: isBenchFull(lineup),
    averageRating,
    issues: validateLineup(lineup, candidates),
  };
}

// ---------------------------------------------------------------------------
// Player picker
// ---------------------------------------------------------------------------

/** What the picker is choosing a player for. */
export type PickerTarget = { kind: 'slot'; slotId: string } | { kind: 'bench' };

export type PlayerStatus = { kind: 'starter'; slotId: string } | { kind: 'substitute' } | { kind: 'reserve' };

export type PlayerOptionView = {
  id: PlayerId;
  fullName: string;
  squadNumber: number | null;
  primaryPosition: Position;
  secondaryPositions: readonly Position[];
  /** Rounded rating for the target (slot position, or primary position for the bench). */
  rating: number;
  /** Fit for the target slot; null when picking a substitute. */
  fit: PositionFit | null;
  status: PlayerStatus;
};

export type PlayerPickerView = {
  target: PickerTarget;
  /** Position being filled, null for the bench. */
  position: Position | null;
  /** Who currently fills the slot, if anyone. */
  current: { id: PlayerId; fullName: string } | null;
  options: PlayerOptionView[];
};

/** Parses the `target` route param. Returns null for anything that isn't 'bench' or a slot in the formation. */
export function parsePickerTarget(raw: string | undefined, formationId: FormationId): PickerTarget | null {
  if (!raw) return null;
  if (raw === 'bench') return { kind: 'bench' };
  return findSlot(getFormation(formationId), raw) ? { kind: 'slot', slotId: raw } : null;
}

/**
 * Squad options for the picker, best first. For a slot, everyone except the
 * current occupant is listed (picking a starter swaps them). For the bench,
 * current substitutes are left out.
 */
export function selectPlayerPicker(
  db: GameDatabase,
  clubId: ClubId,
  lineup: Lineup,
  target: PickerTarget,
): PlayerPickerView {
  const candidates = selectSquadCandidates(db, clubId);
  const numbers = new Map(db.contracts.map((c) => [c.playerId, c.squadNumber]));
  const slot = target.kind === 'slot' ? findSlot(getFormation(lineup.formationId), target.slotId) : undefined;
  const position = slot?.position ?? null;
  const currentId = target.kind === 'slot' ? (lineup.starters[target.slotId] ?? null) : null;
  const currentCandidate = currentId ? candidates.find((c) => c.player.id === currentId) : undefined;

  const statusOf = (id: PlayerId): PlayerStatus => {
    const slotId = startingSlotOf(lineup, id);
    if (slotId) return { kind: 'starter', slotId };
    return lineup.substitutes.includes(id) ? { kind: 'substitute' } : { kind: 'reserve' };
  };

  const options = candidates
    .filter(({ player }) => player.id !== currentId)
    .filter(({ player }) => target.kind === 'slot' || !lineup.substitutes.includes(player.id))
    .map(({ player, attributes }): PlayerOptionView => {
      const ratedAt = position ?? player.primaryPosition;
      return {
        id: player.id,
        fullName: fullName(player),
        squadNumber: numbers.get(player.id) ?? null,
        primaryPosition: player.primaryPosition,
        secondaryPositions: player.secondaryPositions,
        rating: Math.round(effectiveRating(player, attributes, ratedAt)),
        fit: position ? positionFit(player, position) : null,
        status: statusOf(player.id),
      };
    })
    .sort((a, b) => b.rating - a.rating || (a.squadNumber ?? 99) - (b.squadNumber ?? 99));

  return {
    target,
    position,
    current: currentCandidate ? { id: currentCandidate.player.id, fullName: fullName(currentCandidate.player) } : null,
    options,
  };
}
