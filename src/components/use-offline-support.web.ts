import { useEffect } from 'react';

/**
 * Registers the service worker that lets the website work offline and be
 * installed like an app (it's generated into the build by
 * scripts/build-sw.mjs). Only in production builds: the dev server has no
 * sw.js, and a worker caching dev bundles would hide code changes.
 * Runs after mount, so the static pre-render is unaffected.
 */
export function useOfflineSupport(): void {
  useEffect(() => {
    if (__DEV__ || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a bonus: the game works online without it.
    });
  }, []);
}
