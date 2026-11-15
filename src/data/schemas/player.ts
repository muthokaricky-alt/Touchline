import { z } from 'zod';

import {
  AttributeValueSchema,
  ClubIdSchema,
  ContractIdSchema,
  IsoDateSchema,
  NationCodeSchema,
  NonNegativeMoneySchema,
  PlayerIdSchema,
  PositionSchema,
  PreferredFootSchema,
} from './common';

/*
 * A player is split into three records, linked by `playerId`:
 *
 *   Player            who they are        (rarely changes)
 *   PlayerAttributes  how good they are   (changes with training/ageing, M8)
 *   Contract          who employs them    (changes with transfers, M7)
 *
 * Each game system only ever writes to its own record, and each maps to its
 * own SQLite table later. Note there is no `clubId` on Player: a player's
 * club is whatever their contract says, so the two can never disagree.
 * Age is not stored either; it's derived from dateOfBirth (see utils/date).
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const PlayerSchema = z
  .strictObject({
    id: PlayerIdSchema,
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    dateOfBirth: IsoDateSchema,
    nationality: NationCodeSchema,
    heightCm: z.int().min(150).max(215),
    preferredFoot: PreferredFootSchema,
    primaryPosition: PositionSchema,
    secondaryPositions: z.array(PositionSchema).max(4),
  })
  .refine((p) => !p.secondaryPositions.includes(p.primaryPosition), {
    error: 'secondaryPositions must not repeat the primary position',
    path: ['secondaryPositions'],
  })
  .refine((p) => new Set(p.secondaryPositions).size === p.secondaryPositions.length, {
    error: 'secondaryPositions must not contain duplicates',
    path: ['secondaryPositions'],
  });

export type Player = z.infer<typeof PlayerSchema>;

// ---------------------------------------------------------------------------
// Attributes (1–20), grouped the way the UI will display them
// ---------------------------------------------------------------------------

const A = AttributeValueSchema;

export const TechnicalAttributesSchema = z.strictObject({
  finishing: A,
  passing: A,
  crossing: A,
  dribbling: A,
  firstTouch: A,
  tackling: A,
  marking: A,
  heading: A,
});

export const MentalAttributesSchema = z.strictObject({
  vision: A,
  positioning: A,
  decisions: A,
  workRate: A,
  composure: A,
  anticipation: A,
});

export const PhysicalAttributesSchema = z.strictObject({
  pace: A,
  acceleration: A,
  stamina: A,
  strength: A,
});

/** Every player has these; outfield players just have low values. */
export const GoalkeepingAttributesSchema = z.strictObject({
  handling: A,
  reflexes: A,
  aerialReach: A,
  oneOnOnes: A,
  kicking: A,
});

export const PlayerAttributesSchema = z.strictObject({
  playerId: PlayerIdSchema,
  technical: TechnicalAttributesSchema,
  mental: MentalAttributesSchema,
  physical: PhysicalAttributesSchema,
  goalkeeping: GoalkeepingAttributesSchema,
});

export type TechnicalAttributes = z.infer<typeof TechnicalAttributesSchema>;
export type MentalAttributes = z.infer<typeof MentalAttributesSchema>;
export type PhysicalAttributes = z.infer<typeof PhysicalAttributesSchema>;
export type GoalkeepingAttributes = z.infer<typeof GoalkeepingAttributesSchema>;
export type PlayerAttributes = z.infer<typeof PlayerAttributesSchema>;

export type AttributeGroup = Exclude<keyof PlayerAttributes, 'playerId'>;

/** Any single attribute name, e.g. 'finishing' | 'vision' | 'pace' | ... */
export type AttributeKey =
  | keyof TechnicalAttributes
  | keyof MentalAttributes
  | keyof PhysicalAttributes
  | keyof GoalkeepingAttributes;

/**
 * Attribute names per group, read from the schemas so they can't drift.
 * Handy for generators and for rendering attribute tables.
 */
export const ATTRIBUTE_KEYS = {
  technical: TechnicalAttributesSchema.keyof().options,
  mental: MentalAttributesSchema.keyof().options,
  physical: PhysicalAttributesSchema.keyof().options,
  goalkeeping: GoalkeepingAttributesSchema.keyof().options,
} as const;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export const ContractSchema = z
  .strictObject({
    id: ContractIdSchema,
    playerId: PlayerIdSchema,
    clubId: ClubIdSchema,
    squadNumber: z.int().min(1).max(99),
    /** Whole currency units per week. */
    weeklyWage: NonNegativeMoneySchema,
    startDate: IsoDateSchema,
    endDate: IsoDateSchema,
  })
  // ISO dates compare correctly as strings ("2027-06-30" > "2026-07-01").
  .refine((c) => c.endDate > c.startDate, {
    error: 'endDate must be after startDate',
    path: ['endDate'],
  });

export type Contract = z.infer<typeof ContractSchema>;
