import { useEffect, useState } from 'react';

/**
 * Reveals `length` items one at a time, like a live feed. The match itself
 * was simulated instantly; this is purely presentation.
 *
 * Implemented with one setTimeout per step (re-armed by the effect) rather
 * than setInterval, so pausing, skipping and unmounting never leave a timer
 * running.
 */
export function useReplay(length: number, stepMs = 700) {
  const [revealed, setRevealed] = useState(1); // kick-off is visible straight away
  const [playing, setPlaying] = useState(true);
  const finished = revealed >= length;

  useEffect(() => {
    if (!playing || finished) return;
    const timer = setTimeout(() => setRevealed((n) => Math.min(length, n + 1)), stepMs);
    return () => clearTimeout(timer);
  }, [playing, finished, revealed, length, stepMs]);

  return {
    revealed: Math.min(revealed, length),
    finished,
    playing: playing && !finished,
    togglePlaying: () => setPlaying((p) => !p),
    skipToEnd: () => setRevealed(length),
  };
}
