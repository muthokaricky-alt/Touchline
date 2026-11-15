import { z } from 'zod';

import {
  AttributeValueSchema,
  ClubIdSchema,
  HexColourSchema,
  MoneySchema,
  NationCodeSchema,
  NonNegativeMoneySchema,
} from './common';

export const ClubSchema = z.strictObject({
  id: ClubIdSchema,
  name: z.string().min(1),
  /** Three-letter abbreviation for compact UI, e.g. "KBY". */
  shortName: z.string().regex(/^[A-Z]{3}$/, 'must be 3 uppercase letters'),
  city: z.string().min(1),
  country: NationCodeSchema,
  founded: z.int().min(1850).max(2100),
  /** 1–20, same scale as player attributes. Drives squad quality in the generator. */
  reputation: AttributeValueSchema,
  stadium: z.strictObject({
    name: z.string().min(1),
    capacity: z.int().positive(),
  }),
  colours: z.strictObject({
    primary: HexColourSchema,
    secondary: HexColourSchema,
  }),
  finances: z.strictObject({
    /** Can be negative (club in debt). */
    balance: MoneySchema,
    transferBudget: NonNegativeMoneySchema,
    weeklyWageBudget: NonNegativeMoneySchema,
  }),
});

export type Club = z.infer<typeof ClubSchema>;
