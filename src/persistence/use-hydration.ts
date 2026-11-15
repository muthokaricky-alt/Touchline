import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { flushSave, useGameStore } from '@/store/game-store';
import { openActiveSlot } from '@/store/save-slots';

/**
 * Loads the autosave once, after the app has mounted, and reports when it's
 * done. Until then the app shows a loading state (native: the splash screen).
 *
 * Why after mount: the static web export pre-renders the app in Node with a
 * NEW game. If the save were loaded before the first render, the browser's
 * first render would differ from that HTML (React hydration error). Effects
 * don't run during pre-rendering, so this only ever happens in the client.
 *
 * Also flushes pending (debounced) writes when the app goes to the
 * background, so closing the app straight after a match doesn't lose it.
 */
export function useSaveHydration(): boolean {
  const [hydrated, setHydrated] = useState(() => useGameStore.persist.hasHydrated());

  useEffect(() => {
    let active = true;
    openActiveSlot(); // which slot to load (and the one-time move of an old save into slot 1)
    Promise.resolve(useGameStore.persist.rehydrate())
      .catch(() => undefined) // reported via onRehydrateStorage; never block the app
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushSave();
    });
    return () => subscription.remove();
  }, []);

  return hydrated;
}
