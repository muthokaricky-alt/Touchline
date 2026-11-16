import { z } from 'zod';

import { ClubIdSchema, CompetitionIdSchema, IsoDateSchema, PlayerIdSchema } from '@/data/schemas';

/**
 * Season state: which clubs are in which league this season, every fixture
 * (leagues and cup) with its result, and running player totals.
 *
 * Sizing matters because this gets saved: ~760 fixtures a season. Each
 * result keeps the score, goals, cards and POTM (~0.6 KB). Per-player match
 * lines are NOT stored; instead `playerStats` keeps running season totals
 * per player per competition, updated as results come in.
 *
 * Derived, never stored: league tables, cup progress, leaderboards.
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

export const FixtureResultSchema = z.strictObject({
  score: z.strictObject({ home: z.int().min(0), away: z.int().min(0) }),
  goals: z.array(FixtureGoalSchema),
  cards: z.array(FixtureCardSchema),
  playerOfTheMatch: PlayerIdSchema.nullable(),
  /** Cup ties only, when level after 90 minutes. */
  penalties: z.strictObject({ home: z.int().min(0), away: z.int().min(0) }).optional(),
});

export const FixtureSchema = z.strictObject({
  id: z.string().regex(/^fx_[a-z0-9_]+$/),
  competitionId: CompetitionIdSchema,
  /** Round number within its competition: the matchday for leagues, the round for cups. */
  matchday: z.int().min(1),
  date: IsoDateSchema,
  homeId: ClubIdSchema,
  awayId: ClubIdSchema,
  result: FixtureResultSchema.nullable(),
});

/** A cup in this season and the leagues that enter it. */
export const SeasonCupSchema = z.strictObject({
  competitionId: CompetitionIdSchema,
  /** For a national cup: every club of these leagues enters. For the Continental Cup: the leagues qualifiers come from. */
  entrantLeagues: z.array(CompetitionIdSchema).min(1),
  /**
   * Qualified clubs, strongest first (the Continental Cup). When set, they are
   * the entrants instead of the leagues' clubs, and byes go to the first ones.
   */
  entrants: z.array(ClubIdSchema).min(2).optional(),
  /** Fixed date of each round (the Continental Cup avoids the national cups' weeks). Otherwise computed from the league calendar. */
  roundDates: z.array(IsoDateSchema).min(1).optional(),
  /**
   * A group stage (the Continental Cup): the clubs of each group. Rounds 1–6
   * are then the group matchdays and the knockouts follow (see continental.ts).
   */
  groups: z.array(z.array(ClubIdSchema).min(2)).min(2).optional(),
  /** After the groups: two-legged Round of 16, quarter-finals and semi-finals (see continental.ts). */
  twoLegged: z.boolean().optional(),
});

/** Which clubs play in a league THIS season (promotion/relegation changes it). */
export const LeagueMembershipSchema = z.strictObject({
  competitionId: CompetitionIdSchema,
  clubIds: z.array(ClubIdSchema).min(2),
});

/** Running totals for one player in one competition. */
export const PlayerSeasonLineSchema = z.strictObject({
  competitionId: CompetitionIdSchema,
  playerId: PlayerIdSchema,
  clubId: ClubIdSchema,
  appearances: z.int().min(0),
  starts: z.int().min(0),
  minutes: z.int().min(0),
  goals: z.int().min(0),
  assists: z.int().min(0),
  yellowCards: z.int().min(0),
  redCards: z.int().min(0),
  playerOfTheMatch: z.int().min(0),
  /** Sum of match ratings; average = ratingTotal / appearances. */
  ratingTotal: z.number().min(0),
});

export const SeasonSchema = z.strictObject({
  /** e.g. "2026/27" */
  label: z.string().regex(/^\d{4}\/\d{2}$/),
  startYear: z.int(),
  /** All fixture seeds and cup draws derive from this, so a season replays exactly. */
  seed: z.int().min(0),
  leagues: z.array(LeagueMembershipSchema).min(1),
  /**
   * The cups played this season (England's National Cup first, then one per
   * country abroad), each with the leagues whose clubs enter it (its
   * country's, top tier first). Replaced `cupId` in save v11.
   */
  cups: z.array(SeasonCupSchema),
  fixtures: z.array(FixtureSchema),
  playerStats: z.array(PlayerSeasonLineSchema),
});

export type FixtureGoal = z.infer<typeof FixtureGoalSchema>;
export type FixtureCard = z.infer<typeof FixtureCardSchema>;
export type FixtureResult = z.infer<typeof FixtureResultSchema>;
export type Fixture = z.infer<typeof FixtureSchema>;
export type LeagueMembership = z.infer<typeof LeagueMembershipSchema>;
export type SeasonCup = z.infer<typeof SeasonCupSchema>;
export type PlayerSeasonLine = z.infer<typeof PlayerSeasonLineSchema>;
export type Season = z.infer<typeof SeasonSchema>;

export function seasonLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * Mixes a base seed with a number (league index, cup round…) into a new
 * non-negative 31-bit seed. Note `>>> 0` after every XOR: JavaScript's
 * bitwise operators return SIGNED 32-bit ints, and a negative seed slipped
 * through here once (caught by SeasonSchema's `min(0)`).
 */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % 2_147_483_647;
}
