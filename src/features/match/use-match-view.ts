import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { platformStorage } from '@/persistence/storage';

/**
 * How the match is shown: the 2D pitch + commentary, or commentary only
 * (remembered on the device, not in the career save), and whether the
 * screen is in landscape (the full-screen pitch).
 *
 * Rotation: the app is portrait everywhere (root layout); the match screen
 * unlocks it while open, so tilting the phone shows the full-screen pitch,
 * and locks back to portrait when it closes. "Full screen" turns the phone
 * to landscape for people with auto-rotate off; "Exit" turns it back (and
 * keeps portrait for the rest of the match, so it doesn't flip straight back).
 * On the web the layout follows the window's shape; "Full screen" uses the
 * browser's full screen (and a landscape lock where the browser allows it).
 */

const PREFERENCE_KEY = 'touchline-match-view';
export type MatchViewMode = '2d' | 'commentary';

function readMode(): MatchViewMode {
  try {
    return platformStorage.getItem(PREFERENCE_KEY) === 'commentary' ? 'commentary' : '2d';
  } catch {
    return '2d';
  }
}

export function useMatchView() {
  const [mode, setModeState] = useState<MatchViewMode>(readMode);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const setMode = useCallback((next: MatchViewMode) => {
    setModeState(next);
    try {
      void platformStorage.setItem(PREFERENCE_KEY, next);
    } catch {
      // A preference that can't be saved just isn't remembered.
    }
  }, []);

  // Native: rotation allowed on the match screen only.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void ScreenOrientation.unlockAsync().catch(() => undefined);
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    };
  }, []);

  const enterFullScreen = useCallback(() => {
    if (Platform.OS === 'web') {
      // Must start inside the tap handler (browsers only allow full screen from a user gesture).
      const root = typeof document !== 'undefined' ? document.documentElement : null;
      void root
        ?.requestFullscreen?.()
        .then(() => ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE))
        .catch(() => undefined);
      return;
    }
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
  }, []);

  const exitFullScreen = useCallback(() => {
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined' && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, []);

  return { mode, setMode, landscape, enterFullScreen, exitFullScreen };
}
