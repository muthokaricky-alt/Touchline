import { z } from 'zod';

/**
 * Team instructions. Each one is a small ordered set of options (an enum),
 * not a free number: easier to show, easier to explain, and the match engine
 * (Milestone 5) will map each option to concrete effects.
 *
 * The formation lives on the Lineup, not here: which players stand where is
 * team selection; how they play is tactics.
 */

export const MENTALITIES = ['very-defensive', 'defensive', 'balanced', 'attacking', 'very-attacking'] as const;
export const PASSING_STYLES = ['short', 'mixed', 'direct'] as const;
export const TEMPOS = ['slow', 'normal', 'fast'] as const;
export const WIDTHS = ['narrow', 'normal', 'wide'] as const;
export const DEFENSIVE_LINES = ['deep', 'standard', 'high'] as const;
export const PRESSING_LEVELS = ['low', 'medium', 'high'] as const;

export const TacticsSchema = z.strictObject({
  mentality: z.enum(MENTALITIES),
  passing: z.enum(PASSING_STYLES),
  tempo: z.enum(TEMPOS),
  width: z.enum(WIDTHS),
  defensiveLine: z.enum(DEFENSIVE_LINES),
  pressing: z.enum(PRESSING_LEVELS),
});

export type Tactics = z.infer<typeof TacticsSchema>;

/** The name of one instruction: 'mentality' | 'passing' | ... */
export type Instruction = keyof Tactics;

/**
 * Options for each instruction, in order (cautious → bold).
 *
 * Declared with a *mapped type* so that, inside generic code,
 * `INSTRUCTION_OPTIONS[key]` (key: K) is typed `Tactics[K][]`. Without the
 * annotation TypeScript sees a union of six tuples and can't connect the
 * array to the key, forcing unsafe casts.
 */
export const INSTRUCTION_OPTIONS: { readonly [K in Instruction]: readonly Tactics[K][] } = {
  mentality: MENTALITIES,
  passing: PASSING_STYLES,
  tempo: TEMPOS,
  width: WIDTHS,
  defensiveLine: DEFENSIVE_LINES,
  pressing: PRESSING_LEVELS,
};

/** Display order of the instructions. */
export const INSTRUCTION_ORDER: readonly Instruction[] = [
  'mentality',
  'passing',
  'tempo',
  'width',
  'defensiveLine',
  'pressing',
];

export const DEFAULT_TACTICS: Tactics = {
  mentality: 'balanced',
  passing: 'mixed',
  tempo: 'normal',
  width: 'normal',
  defensiveLine: 'standard',
  pressing: 'medium',
};

/**
 * Returns new tactics with one instruction changed (immutable, like the
 * lineup functions). The generic `K` ties the value's type to the key, so
 * `setInstruction(t, 'pressing', 'wide')` is a compile error.
 */
export function setInstruction<K extends Instruction>(tactics: Tactics, key: K, value: Tactics[K]): Tactics {
  if (tactics[key] === value) return tactics;
  const next = { ...tactics };
  next[key] = value;
  return next;
}

export function tacticsEqual(a: Tactics, b: Tactics): boolean {
  return INSTRUCTION_ORDER.every((key) => a[key] === b[key]);
}
