import { z } from 'zod';

/**
 * Shared building blocks for every data schema.
 *
 * Pattern used throughout `src/data/schemas`:
 *   - `FooSchema` is a runtime Zod value that can validate unknown data.
 *   - `Foo` is the TypeScript type derived from it with `z.infer`.
 * The schema is the single source of truth; never hand-write a duplicate type.
 */

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

/**
 * IDs carry a prefix (`plr_0001`, `club_kestrel_bay`) so they are
 * self-describing in data files and a club ID can't pass as a player ID.
 */
function prefixedId(prefix: string) {
  return z
    .string()
    .regex(
      new RegExp(`^${prefix}_[a-z0-9_]+$`),
      `must look like "${prefix}_..." using lowercase letters, digits and underscores`,
    );
}

export const PlayerIdSchema = prefixedId('plr');
export const ClubIdSchema = prefixedId('club');
export const CompetitionIdSchema = prefixedId('comp');
export const ContractIdSchema = prefixedId('con');

export type PlayerId = z.infer<typeof PlayerIdSchema>;
export type ClubId = z.infer<typeof ClubIdSchema>;
export type CompetitionId = z.infer<typeof CompetitionIdSchema>;
export type ContractId = z.infer<typeof ContractIdSchema>;

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** Calendar date as `YYYY-MM-DD`. Impossible dates (e.g. 2025-02-30) are rejected. */
export const IsoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** Player attribute scale: whole numbers 1–20. */
export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 20;
export const AttributeValueSchema = z.int().min(ATTRIBUTE_MIN).max(ATTRIBUTE_MAX);

/** Money is always whole currency units (no floating-point drift). Can be negative (debt). */
export const MoneySchema = z.int();
/** Money that can't be negative: wages, budgets. */
export const NonNegativeMoneySchema = z.int().min(0);

/** Three-letter uppercase nation code, e.g. "ENG", "ESP". */
export const NationCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'must be a 3-letter uppercase code');
export type NationCode = z.infer<typeof NationCodeSchema>;

export const HexColourSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'must be a colour like "#1D2A35"');

// ---------------------------------------------------------------------------
// Football enums
// ---------------------------------------------------------------------------

/**
 * Playing positions. `as const` keeps the literal strings so `Position` is a
 * union ('GK' | 'RB' | ...) rather than plain `string`.
 */
export const POSITIONS = [
  'GK', // goalkeeper
  'RB', // right back
  'CB', // centre back
  'LB', // left back
  'RWB', // right wing-back
  'LWB', // left wing-back
  'DM', // defensive midfielder
  'CM', // central midfielder
  'RM', // right midfielder
  'LM', // left midfielder
  'AM', // attacking midfielder
  'RW', // right winger
  'LW', // left winger
  'ST', // striker
] as const;

export const PositionSchema = z.enum(POSITIONS);
export type Position = z.infer<typeof PositionSchema>;

export const PreferredFootSchema = z.enum(['left', 'right', 'both']);
export type PreferredFoot = z.infer<typeof PreferredFootSchema>;
