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
 *     ~5 MB. Stored as base64 text behind a `z2:` prefix.
 *     History: `z1:` stored the bytes as a "binary string" (one character
 *     per byte, NUL included). Browsers keep that, but on phones the string
 *     crosses into native code and SQLite, where a NUL can end the text
 *     (iOS binds text up to the first NUL): saves came back cut off, the
 *     backup too, and the app started a new game on every launch. `z1:`
 *     saves are still read; anything without a prefix is an older,
 *     uncompressed save and is read as it is.
 *   - reads every write back and compares it: storage that changes what it
 *     was given fails loudly (a notice) instead of losing the career later.
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
const PREFIX = 'z2:';
const BINARY_PREFIX = 'z1:';

export const slotKey = (slot: number) => `touchline-save-${slot}`;
export const backupKey = (key: string) => `${key}.backup`;
const slotOf = (key: string): number | null => {
  const match = /^touchline-save-(\d+)$/.exec(key);
  return match ? Number(match[1]) : null;
};

export function compress(json: string): string {
  return PREFIX + toBase64(deflateSync(strToU8(json), { level: 6 }));
}

/** Throws if a compressed value is damaged. Uncompressed (older) saves pass through. */
export function decompress(stored: string): string {
  if (stored.startsWith(PREFIX)) return strFromU8(inflateSync(fromBase64(stored.slice(PREFIX.length))));
  if (stored.startsWith(BINARY_PREFIX)) return strFromU8(inflateSync(strToU8(stored.slice(BINARY_PREFIX.length), true)));
  return stored;
}

// --- Base64 (text-safe on every platform: letters, digits, + / =) ------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  // In chunks, so no single string concatenation gets huge.
  for (let start = 0; start < bytes.length; start += 3 * 4096) {
    const end = Math.min(bytes.length, start + 3 * 4096);
    let chunk = '';
    for (let i = start; i < end; i += 3) {
      const a = bytes[i];
      const b = i + 1 < end ? bytes[i + 1] : 0;
      const c = i + 2 < end ? bytes[i + 2] : 0;
      chunk +=
        ALPHABET[a >> 2] +
        ALPHABET[((a & 3) << 4) | (b >> 4)] +
        (i + 1 < end ? ALPHABET[((b & 15) << 2) | (c >> 6)] : '=') +
        (i + 2 < end ? ALPHABET[c & 63] : '=');
    }
    parts.push(chunk);
  }
  return parts.join('');
}

/** Throws on anything that isn't base64 (a damaged save). */
export function fromBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(text)) throw new RangeError('Not base64');
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let out = 0;
  for (let i = 0; i < text.length; i += 4) {
    const n =
      (LOOKUP[text.charCodeAt(i)] << 18) |
      (LOOKUP[text.charCodeAt(i + 1)] << 12) |
      (LOOKUP[text.charCodeAt(i + 2)] << 6) |
      LOOKUP[text.charCodeAt(i + 3)];
    if (out < bytes.length) bytes[out++] = (n >> 16) & 255;
    if (out < bytes.length) bytes[out++] = (n >> 8) & 255;
    if (out < bytes.length) bytes[out++] = n & 255;
  }
  return bytes;
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
      const stored = compress(value);
      void base.setItem(key, stored);
      // Read it back: if the device's storage changed it, say so now (the save layer shows a notice).
      if (read(key) !== stored) throw new Error('This device did not store the save correctly.');
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
