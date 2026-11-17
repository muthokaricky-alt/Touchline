import { setAudioModeAsync, useAudioPlaylist, useAudioPlaylistStatus, type AudioPlaylist } from 'expo-audio';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useMusicSettings } from './music-settings';
import { TRACKS } from './tracks';

/** Background music sits under everything else: quiet. */
const VOLUME = 0.35;
const FADE_MS = 900;
const FADE_STEPS = 18;
const SOURCES = TRACKS.map((t) => t.source);

/**
 * The menu music. Renders nothing; mounted once in the root layout, after
 * the save has loaded (so never while the website is pre-rendered).
 *
 * Plays the three tracks in order, round and round, when music is on, the
 * app is in front, and the match screen isn't showing (a match has its own
 * atmosphere): it fades out going into a match and back in afterwards.
 * Respects the phone's silent switch and mixes with other apps' audio.
 */
export function MusicPlayer() {
  const enabled = useMusicSettings((s) => s.enabled);
  const skips = useMusicSettings((s) => s.skips);
  const setTrackIndex = useMusicSettings((s) => s.setTrackIndex);
  const pathname = usePathname();
  const active = useAppInFront();
  const playlist = useAudioPlaylist({ sources: SOURCES, loop: 'all' });
  const status = useAudioPlaylistStatus(playlist);
  const shouldPlay = enabled && active && !pathname.startsWith('/match');

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
  }, []);

  // A new track (next, or the last one ended): report it, and keep it at background volume
  // (on the web each track is its own <audio> element, which starts at full volume).
  useEffect(() => {
    setTrackIndex(status.currentIndex);
    keepBackgroundVolume(playlist);
  }, [status.currentIndex, setTrackIndex, playlist]);

  // Fade in or out whenever it should start or stop.
  useEffect(() => fadeTo(playlist, shouldPlay), [playlist, shouldPlay]);

  // "Next track" on the Club tab (skips the first value: that's just the start).
  const lastSkips = useRef(skips);
  useEffect(() => {
    if (skips === lastSkips.current) return;
    lastSkips.current = skips;
    playlist.next();
  }, [skips, playlist]);

  // Web: browsers only allow sound after the visitor has interacted with the page, so a
  // first try may be refused. Try again on every tap or key press until it's playing.
  const wanted = useRef(shouldPlay);
  useEffect(() => {
    wanted.current = shouldPlay;
  }, [shouldPlay]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const retry = () => {
      if (wanted.current && !playlist.playing) startAtBackgroundVolume(playlist);
    };
    const events = ['pointerdown', 'click', 'keydown'] as const;
    for (const event of events) window.addEventListener(event, retry);
    return () => {
      for (const event of events) window.removeEventListener(event, retry);
    };
  }, [playlist]);

  return null;
}

/** A playing track stays at background volume (a new track's player may start at full volume). */
function keepBackgroundVolume(playlist: AudioPlaylist) {
  if (playlist.playing) playlist.volume = VOLUME;
}

function startAtBackgroundVolume(playlist: AudioPlaylist) {
  playlist.volume = VOLUME;
  playlist.play();
}

/** Ramps the volume to VOLUME (starting playback first) or to 0 (then pauses). Returns a cancel function. */
function fadeTo(playlist: AudioPlaylist, on: boolean): () => void {
  const from = playlist.playing ? playlist.volume : 0;
  const to = on ? VOLUME : 0;
  if (on && !playlist.playing) {
    playlist.volume = 0;
    playlist.play();
  }
  let step = 0;
  const timer = setInterval(() => {
    step++;
    playlist.volume = from + ((to - from) * step) / FADE_STEPS;
    if (step >= FADE_STEPS) {
      clearInterval(timer);
      if (!on) playlist.pause();
    }
  }, FADE_MS / FADE_STEPS);
  return () => clearInterval(timer);
}

/** True while the app is in front: native app state, or a visible browser tab. */
function useAppInFront(): boolean {
  const [inFront, setInFront] = useState(() =>
    Platform.OS === 'web' ? typeof document === 'undefined' || document.visibilityState !== 'hidden' : AppState.currentState !== 'background',
  );
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const onChange = () => setInFront(document.visibilityState !== 'hidden');
      document.addEventListener('visibilitychange', onChange);
      return () => document.removeEventListener('visibilitychange', onChange);
    }
    const subscription = AppState.addEventListener('change', (state) => setInFront(state === 'active'));
    return () => subscription.remove();
  }, []);
  return inFront;
}
