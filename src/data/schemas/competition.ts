import { z } from 'zod';

import { ClubIdSchema, CompetitionIdSchema, NationCodeSchema } from './common';

/**
 * A round-robin league. This describes the competition's *rules*; fixtures,
 * results and tables are season state and arrive in Milestone 6.
 */
export const LeagueSchema = z
  .strictObject({
    id: CompetitionIdSchema,
    type: z.literal('league'),
    name: z.string().min(1),
    shortName: z.string().min(1).max(12),
    country: NationCodeSchema,
    /** 1 = top division. */
    tier: z.int().min(1),
    clubIds: z.array(ClubIdSchema).min(2),
    rules: z.strictObject({
      /** 2 = everyone plays everyone home and away. */
      roundsPerOpponent: z.int().min(1).max(4),
      points: z.strictObject({
        win: z.int().min(0),
        draw: z.int().min(0),
        loss: z.int().min(0),
      }),
      promotionPlaces: z.int().min(0),
      relegationPlaces: z.int().min(0),
    }),
  })
  .refine((l) => new Set(l.clubIds).size === l.clubIds.length, {
    error: 'clubIds must not contain duplicates',
    path: ['clubIds'],
  })
  .refine((l) => l.rules.promotionPlaces + l.rules.relegationPlaces < l.clubIds.length, {
    error: 'promotion + relegation places must be fewer than the number of clubs',
    path: ['rules'],
  });

export type League = z.infer<typeof LeagueSchema>;

/**
 * Every competition type. Only leagues exist for now; in Milestone 6 this
 * becomes `z.discriminatedUnion('type', [LeagueSchema, CupSchema])`, and the
 * `type` field tells TypeScript which shape it's looking at.
 */
export const CompetitionSchema = LeagueSchema;
export type Competition = z.infer<typeof CompetitionSchema>;
