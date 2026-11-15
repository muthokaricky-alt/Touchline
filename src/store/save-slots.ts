import { saveStatus } from '@/persistence/save-status';
import { exportFile, parseImportFile, type ExportFile } from '@/persistence/save-transfer';
import { slotKey, SLOT_COUNT } from '@/persistence/slot-storage';

import { flushSave, slotStorage, useGameStore, validatePersisted } from './game-store';

/**
 * Save-slot operations (Milestone 10a). They sit outside the Zustand actions
 * because they change WHERE the store persists (the slot key) and reload it,
 * rather than changing game state.
 */

const isSlot = (slot: number) => Number.isInteger(slot) && slot >= 1 && slot <= SLOT_COUNT;

/** Called once before the first load: moves an old single-slot save into slot 1 and opens the remembered slot. */
export function openActiveSlot(): number {
  slotStorage.migrateLegacy();
  const slot = slotStorage.activeSlot();
  useGameStore.persist.setOptions({ name: slotKey(slot) });
  saveStatus.slotsChanged(slot, slotStorage.index());
  return slot;
}

/**
 * Saves the current slot and loads another (an empty slot starts a new game,
 * which shows the new-career screen). Hydration doesn't write, so loading a
 * slot can never overwrite it.
 */
export async function switchSlot(slot: number): Promise<void> {
  if (!isSlot(slot)) throw new RangeError(`There are only ${SLOT_COUNT} save slots.`);
  flushSave();
  slotStorage.setActiveSlot(slot);
  useGameStore.persist.setOptions({ name: slotKey(slot) });
  saveStatus.dismissNotice();
  saveStatus.resetLoaded();
  await useGameStore.persist.rehydrate();
  saveStatus.slotsChanged(slot, slotStorage.index());
}

/** Deletes a slot. Deleting the slot being played starts a new game in it. */
export async function deleteSlot(slot: number): Promise<void> {
  if (!isSlot(slot)) throw new RangeError(`There are only ${SLOT_COUNT} save slots.`);
  const active = slotStorage.activeSlot();
  if (slot === active) flushSave(); // nothing pending may be written after the delete
  slotStorage.clearSlot(slot);
  if (slot === active) await switchSlot(slot);
  else saveStatus.slotsChanged(active, slotStorage.index());
}

/** The slot's save as a file to share/download, or null if the slot is empty. */
export function exportSlot(slot: number, now: Date = new Date()): ExportFile | null {
  if (slot === slotStorage.activeSlot()) flushSave();
  const json = slotStorage.getItem(slotKey(slot)) as string | null;
  return json ? exportFile(json, now) : null;
}

/**
 * Imports a save file into `slot` (replacing what's there) and switches to
 * it. Validated exactly like a load first; returns an error message, or
 * null on success.
 */
export async function importIntoSlot(text: string, slot: number): Promise<string | null> {
  if (!isSlot(slot)) return `There are only ${SLOT_COUNT} save slots.`;
  const parsed = parseImportFile(text);
  if (!parsed.ok) return parsed.reason;
  const check = validatePersisted(parsed.save);
  if (!check.ok) return check.reason;
  if (slot === slotStorage.activeSlot()) flushSave();
  slotStorage.clearSlot(slot);
  slotStorage.setItem(slotKey(slot), JSON.stringify(parsed.save));
  await switchSlot(slot);
  return null;
}
