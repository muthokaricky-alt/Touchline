/**
 * Seeded pseudo-random number generator.
 *
 * `Math.random()` gives different numbers on every run, which makes generated
 * data and (later) match results impossible to reproduce in tests. A seeded
 * generator returns the same sequence for the same seed, every time.
 *
 * Algorithm: mulberry32. It's tiny and fast, and plenty good for a game
 * (not for cryptography).
 */
export type Rng = {
  /** Float in [0, 1). */
  next(): number;
  /** Whole number in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p` (0–1). */
  chance(p: number): boolean;
  /** A random element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0; // force to an unsigned 32-bit integer

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError(`rng.int needs integers with min <= max (got ${min}, ${max})`);
    }
    return min + Math.floor(next() * (max - min + 1));
  }

  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new RangeError('rng.pick called with an empty array');
      return items[int(0, items.length - 1)];
    },
  };
}
