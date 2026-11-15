import Storage from 'expo-sqlite/kv-store';
import type { StateStorage } from 'zustand/middleware';

/**
 * NATIVE save storage (iOS/Android): expo-sqlite's key-value store, which is
 * included in Expo Go and has synchronous calls.
 *
 * Platform-specific files: Metro picks `storage.web.ts` on web and this file
 * everywhere else, so callers just `import { platformStorage } from './storage'`.
 */
export const platformStorage: StateStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => Storage.setItemSync(key, value),
  removeItem: (key) => {
    Storage.removeItemSync(key);
  },
};
