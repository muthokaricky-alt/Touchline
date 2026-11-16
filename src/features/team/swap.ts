import { samePlace, type LineupPlace } from '@/game/lineup';
import type { LineupPlayerView, TeamSheetView } from '@/game/squad/team-sheet';

/*
 * Tap one, tap another: what a tap on the team sheet does. Pure, so the rules
 * are tested without rendering anything (the panel only keeps `selected`).
 */

export type TapOutcome =
  | { kind: 'select'; place: LineupPlace }
  | { kind: 'deselect' }
  | { kind: 'swap'; a: LineupPlace; b: LineupPlace }
  /** An empty position with nothing selected: open the squad list for it. */
  | { kind: 'choose'; slotId: string };

/** The player in a place, or null (an empty slot, or a substitute no longer on the bench). */
export function playerAt(sheet: TeamSheetView, place: LineupPlace): LineupPlayerView | null {
  if (place.kind === 'slot') return sheet.slots.find((s) => s.slotId === place.slotId)?.player ?? null;
  return sheet.substitutes.find((p) => p.id === place.playerId) ?? null;
}

/**
 * The selection as it applies to the current sheet: null once its player
 * has gone (moved, removed, sold) or its slot left with a formation change,
 * so a stale selection can never swap the wrong player.
 */
export function currentSelection(sheet: TeamSheetView, selected: LineupPlace | null): LineupPlace | null {
  return selected && playerAt(sheet, selected) ? selected : null;
}

export function tapOutcome(sheet: TeamSheetView, selected: LineupPlace | null, tapped: LineupPlace): TapOutcome {
  const current = currentSelection(sheet, selected);
  if (!current) {
    if (playerAt(sheet, tapped)) return { kind: 'select', place: tapped };
    return tapped.kind === 'slot' ? { kind: 'choose', slotId: tapped.slotId } : { kind: 'deselect' };
  }
  if (samePlace(current, tapped)) return { kind: 'deselect' };
  return { kind: 'swap', a: current, b: tapped };
}
