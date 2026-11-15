import type { StateStorage } from 'zustand/middleware';

/**
 * WEB save storage: the browser's localStorage (~5 MB per site; a full
 * season save is well under 1 MB).
 *
 * Not expo-sqlite on web: that needs WebAssembly plus COOP/COEP headers
 * from every server hosting the app. `typeof window` guards the static
 * export, which runs in Node where there's no localStorage.
 */
const local = () => (typeof window !== 'undefined' ? window.localStorage : undefined);

export const platformStorage: StateStorage = {
  getItem: (key) => local()?.getItem(key) ?? null,
  setItem: (key, value) => local()?.setItem(key, value),
  removeItem: (key) => local()?.removeItem(key),
};
