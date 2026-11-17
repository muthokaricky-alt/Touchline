import { create } from 'zustand';

import { platformStorage } from '@/persistence/storage';

/*
 * Music on/off is a device preference (like the 2D/Commentary choice), not
 * part of a career save: it's remembered in platform storage, read once at
 * start-up. The player (MusicPlayer) reports which track is playing, and
 * watches `skips` to go to the next track when the Club tab asks.
 */

const KEY = 'touchline-music';

function readEnabled(): boolean {
  try {
    return platformStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

type MusicSettings = {
  enabled: boolean;
  /** Index into TRACKS of the track playing (or paused) now. */
  trackIndex: number;
  /** Bumped by "Next track"; the player skips when it changes. */
  skips: number;
  setEnabled: (enabled: boolean) => void;
  nextTrack: () => void;
  setTrackIndex: (index: number) => void;
};

export const useMusicSettings = create<MusicSettings>((set) => ({
  enabled: readEnabled(),
  trackIndex: 0,
  skips: 0,
  setEnabled: (enabled) => {
    set({ enabled });
    try {
      void platformStorage.setItem(KEY, enabled ? 'on' : 'off');
    } catch {
      // Not remembered, still applied.
    }
  },
  nextTrack: () => set((s) => ({ skips: s.skips + 1 })),
  setTrackIndex: (trackIndex) => set({ trackIndex }),
}));
