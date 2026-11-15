import type { StateStorage } from 'zustand/middleware';

/**
 * Wraps a storage so writes happen at most once per `waitMs`: Zustand's
 * persist writes on EVERY state change, and late in a season a save is close
 * to 1 MB. Tapping through the lineup screen shouldn't rewrite it each time.
 *
 * - Reads see a pending (not yet written) value, so nothing looks stale.
 * - `flush()` writes immediately: call it when the app goes to the background.
 * - Storage errors (disk full, private browsing) are reported, never thrown:
 *   a failed save must not crash the game.
 */
export type DebouncedStorage = {
  storage: StateStorage;
  flush: () => void;
};

export type DebounceCallbacks = {
  onWrite?: () => void;
  onError?: (error: unknown) => void;
};

export function createDebouncedStorage(base: StateStorage, waitMs: number, { onWrite, onError }: DebounceCallbacks = {}): DebouncedStorage {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const [key, value] of pending) {
      try {
        void base.setItem(key, value);
        onWrite?.();
      } catch (error) {
        onError?.(error);
      }
    }
    pending.clear();
  };

  const storage: StateStorage = {
    getItem: (key) => {
      if (pending.has(key)) return pending.get(key)!;
      try {
        return base.getItem(key);
      } catch (error) {
        onError?.(error);
        return null;
      }
    },
    setItem: (key, value) => {
      pending.set(key, value);
      if (!timer) timer = setTimeout(flush, waitMs);
    },
    removeItem: (key) => {
      pending.delete(key);
      try {
        void base.removeItem(key);
      } catch (error) {
        onError?.(error);
      }
    },
  };

  return { storage, flush };
}

/** In-memory storage for tests (and a safe fallback). */
export function createMemoryStorage(initial: Record<string, string> = {}): StateStorage & { dump: () => Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    dump: () => Object.fromEntries(data),
  };
}
