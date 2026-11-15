import { z } from 'zod';

import { ClubIdSchema, CompetitionIdSchema, IsoDateSchema, PlayerIdSchema, PositionSchema } from '@/data/schemas';

/**
 * Season state: fixtures and their results.
 *
 * Results are stored *compactly* (score, scorers, cards, per-player line) and
 * not as the engine's full event list: a season has 56 matches × ~150
 * events, and this will be saved to disk in the persistence step. Zod
 * schemas are defined now so that saved seasons can be validated on load.
 */

const SideSchema = z.enum(['home', 'away']);

export const FixtureGoalSchema = z.strictObject({
  minute: z.int().min(0).max(90),
  addedTime: z.int().min(1).optional(),
  side: SideSchema,
  scorerId: PlayerIdSchema,
  assistId: PlayerIdSchema.nullable(),
});

export const FixtureCardSchema = z.strictObject({
  minute: z.int().min(0).max(90),
  addedTime: z.int().min(1).optional(),
  side: SideSchema,
  playerId: PlayerIdSchema,
  card: z.enum(['yellow', 'second-yellow', 'red']),
});

/** One player's line from one match: enough for season stats. */
export const FixturePlayerLineSchema = z.strictObject({
  playerId: PlayerIdSchema,
  side: SideSchema,
  position: PositionSchema,
  started: z.boolean(),
  minutes: z.int().min(0).max(90),
  goals: z.int().min(0),
  assists: z.int().min(0),
  yellowCards: z.int().min(0).max(2),
  redCard: z.boolean(),
  rating: z.number().min(3).max(10),
});

export const FixtureResultSchema = z.strictObject({
  score: z.strictObject({ home: z.int().min(0), away: z.int().min(0) }),
  goals: z.array(FixtureGoalSchema),
  cards: z.array(FixtureCardSchema),
  players: z.array(FixturePlayerLineSchema),
  playerOfTheMatch: PlayerIdSchema.nullable(),
});

export const FixtureSchema = z.strictObject({
  id: z.string().regex(/^fx_[a-z0-9_]+$/),
  competitionId: CompetitionIdSchema,
  matchday: z.int().min(1),
  date: IsoDateSchema,
  homeId: ClubIdSchema,
  awayId: ClubIdSchema,
  result: FixtureResultSchema.nullable(),
});

export const SeasonSchema = z.strictObject({
  /** e.g. "2026/27" */
  label: z.string().regex(/^\d{4}\/\d{2}$/),
  startYear: z.int(),
  competitionId: CompetitionIdSchema,
  /** All fixture seeds derive from this, so a season replays exactly. */
  seed: z.int().min(0),
  fixtures: z.array(FixtureSchema),
});

export type FixtureGoal = z.infer<typeof FixtureGoalSchema>;
export type FixtureCard = z.infer<typeof FixtureCardSchema>;
export type FixturePlayerLine = z.infer<typeof FixturePlayerLineSchema>;
export type FixtureResult = z.infer<typeof FixtureResultSchema>;
export type Fixture = z.infer<typeof FixtureSchema>;
export type Season = z.infer<typeof SeasonSchema>;

export function seasonLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}
