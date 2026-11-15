import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { StateStorage } from 'zustand/middleware';

/**
 * Save slots on top of the platform storage (Milestone 10a).
 *
 *   persist → debounced → SLOT STORAGE → platform (localStorage / SQLite)
 *
 * The slot storage:
 *   - compresses every save with deflate (fflate): a 1.1 MB season save
 *     becomes ~100 KB, so three slots plus backups fit easily in a browser's
 *     ~5 MB. Stored as a "binary string" (one character per byte) behind a
 *     `z1:` prefix; anything without the prefix is an older, uncompressed
 *     save and is read as it is.
 *   - keeps the previous save as `<key>.backup` before every write, so a
 *     damaged write can be recovered.
 *   - keeps a small index (who, where, when) per slot, so the slot picker
 *     doesn't have to decompress three saves.
 *
 * Measured on a real save: deflate ~85 ms, inflate ~10 ms (lz-string, the
 * first choice, took ~950 ms per write: a visible freeze after each change).
 */

export const SLOT_COUNT = 3;
export const LEGACY_SAVE_KEY = 'touchline-save';
const ACTIVE_SLOT_KEY = 'touchline-active-slot';
const INDEX_KEY = 'touchline-slots';
const PREFIX = 'z1:';

export const slotKey = (slot: number) => `touchline-save-${slot}`;
export const backupKey = (key: string) => `${key}.backup`;
const slotOf = (key: string): number | null => {
  const match = /^touchline-save-(\d+)$/.exec(key);
  return match ? Number(match[1]) : null;
};

export function compress(json: string): string {
  return PREFIX + strFromU8(deflateSync(strToU8(json), { level: 6 }), true);
}

/** Throws if a compressed value is damaged. Uncompressed (older) saves pass through. */
export function decompress(stored: string): string {
  return stored.startsWith(PREFIX) ? strFromU8(inflateSync(strToU8(stored.slice(PREFIX.length), true))) : stored;
}

/** What the slot picker shows; read from the save when it's written. */
export type SlotSummary = {
  managerName: string | null;
  clubId: string;
  seasonLabel: string;
  currentDate: string;
  /** Epoch ms of the write. */
  savedAt: number;
};

/** Pulls the summary out of a persisted save (`{ state, version }` JSON). Null if it isn't one. */
export function summarise(json: string, now: number): SlotSummary | null {
  try {
    const { state } = JSON.parse(json) as { state?: Record<string, unknown> };
    if (!state || typeof state.userClubId !== 'string') return null;
    const manager = state.manager as { name?: string } | null | undefined;
    const season = state.season as { label?: string } | undefined;
    return {
      managerName: manager?.name ?? null,
      clubId: state.userClubId,
      seasonLabel: season?.label ?? '',
      currentDate: String(state.currentDate ?? ''),
      savedAt: now,
    };
  } catch {
    return null;
  }
}

export type SlotIndex = Partial<Record<number, SlotSummary>>;

export type SlotStorage = StateStorage & {
  /** The previous good save of `key`, decompressed, or null. */
  readBackup: (key: string) => string | null;
  index: () => SlotIndex;
  activeSlot: () => number;
  setActiveSlot: (slot: number) => void;
  /** Removes a slot's save, backup and index entry. */
  clearSlot: (slot: number) => void;
  /** One-time move of the pre-slot save (`touchline-save`) into slot 1. */
  migrateLegacy: () => void;
};

export function createSlotStorage(base: StateStorage, now: () => number = Date.now): SlotStorage {
  // The platform storages used here are synchronous; StateStorage's types also allow promises.
  const read = (key: string) => base.getItem(key) as string | null;
  const readIndex = (): SlotIndex => {
    try {
      return JSON.parse(read(INDEX_KEY) ?? '{}') as SlotIndex;
    } catch {
      return {};
    }
  };
  const writeIndex = (index: SlotIndex) => void base.setItem(INDEX_KEY, JSON.stringify(index));

  const readBackup = (key: string) => {
    const stored = read(backupKey(key));
    if (stored === null) return null;
    try {
      return decompress(stored);
    } catch {
      return null;
    }
  };

  return {
    getItem: (key) => {
      const stored = read(key);
      if (stored === null) return null;
      try {
        return decompress(stored);
      } catch {
        // Unreadable (e.g. a write cut off half-way): fall back to the previous save.
        // If that's missing too, persist sees "no save" and the career can't load (reported by the store).
        return readBackup(key);
      }
    },
    setItem: (key, value) => {
      const previous = read(key);
      if (previous !== null) void base.setItem(backupKey(key), previous);
      void base.setItem(key, compress(value));
      const slot = slotOf(key);
      const summary = slot !== null ? summarise(value, now()) : null;
      if (slot !== null && summary) writeIndex({ ...readIndex(), [slot]: summary });
    },
    removeItem: (key) => {
      void base.removeItem(key);
      void base.removeItem(backupKey(key));
    },
    readBackup,
    index: readIndex,
    activeSlot: () => {
      const n = Number(read(ACTIVE_SLOT_KEY));
      return Number.isInteger(n) && n >= 1 && n <= SLOT_COUNT ? n : 1;
    },
    setActiveSlot: (slot) => void base.setItem(ACTIVE_SLOT_KEY, String(slot)),
    clearSlot: (slot) => {
      void base.removeItem(slotKey(slot));
      void base.removeItem(backupKey(slotKey(slot)));
      const index = readIndex();
      delete index[slot];
      writeIndex(index);
    },
    migrateLegacy: () => {
      const legacy = read(LEGACY_SAVE_KEY);
      if (legacy === null || read(slotKey(1)) !== null) return;
      void base.setItem(slotKey(1), legacy); // still uncompressed: decompress() reads it as is, the next write compresses
      const summary = summarise(legacy, now());
      if (summary) writeIndex({ ...readIndex(), 1: summary });
      void base.removeItem(LEGACY_SAVE_KEY);
    },
  };
}
