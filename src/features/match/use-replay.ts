import { useEffect, useState } from 'react';

/**
 * Reveals `length` items one at a time, like a live feed. The match itself
 * was simulated instantly; this is purely presentation.
 *
 * Implemented with one setTimeout per step (re-armed by the effect) rather
 * than setInterval, so pausing, skipping and unmounting never leave a timer
 * running.
 */
/**
 * `stepMs`: how long before the next item appears; a function of that item's
 * index gives each item its own wait (the 2D view's build-ups need longer).
 */
export function useReplay(length: number, stepMs: number | ((nextIndex: number) => number) = 700, initialRevealed = 1) {
  // Kick-off is visible straight away; a resumed match starts where it was left.
  const [revealed, setRevealed] = useState(Math.max(1, initialRevealed));
  const [playing, setPlaying] = useState(true);
  const finished = revealed >= length;

  useEffect(() => {
    if (!playing || finished) return;
    const wait = typeof stepMs === 'function' ? stepMs(revealed) : stepMs;
    const timer = setTimeout(() => setRevealed((n) => Math.min(length, n + 1)), wait);
    return () => clearTimeout(timer);
  }, [playing, finished, revealed, length, stepMs]);

  return {
    revealed: Math.min(revealed, length),
    finished,
    playing: playing && !finished,
    togglePlaying: () => setPlaying((p) => !p),
    pause: () => setPlaying(false),
    resume: () => setPlaying(true),
    skipToEnd: () => setRevealed(length),
  };
}
