import { z } from 'zod';

import { ClubIdSchema, PlayerIdSchema, type ClubId, type GameDatabase, type PlayerId } from '@/data/schemas';
import { changeProblem, clockKey, matchSnapshot, simulateMatch } from '@/engine/simulate';
import type { MatchChange, MatchClock, MatchInput, MatchResult, MatchSnapshot, Side } from '@/engine/types';

import { conditionOn, type ConditionState } from '../condition/condition';
import type { Lineup } from '../lineup';
import { prepareUserFixture } from '../season/season-flow';
import type { Season } from '../season/season';
import { TacticsSchema, type Tactics } from '../tactics/tactics';
import { prepareFriendly } from './friendly';

/**
 * A match in progress, as SAVED: which match, plus the manager's in-match
 * changes. Nothing else is stored, because the match itself can always be
 * re-simulated from the career state (same seed, same teams) plus these
 * changes. That's also why nothing that affects the match (lineup,
 * transfers…) may change until full time: the store refuses, and the app
 * keeps the user on the match screen.
 */

const MatchClockSchema = z.strictObject({ minute: z.int().min(0).max(90), addedTime: z.int().min(1).optional() });
const SideSchema = z.enum(['home', 'away']);

export const MatchChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ after: MatchClockSchema, side: SideSchema, kind: z.literal('substitution'), offId: PlayerIdSchema, onId: PlayerIdSchema }),
  z.strictObject({ after: MatchClockSchema, side: SideSchema, kind: z.literal('tactics'), tactics: TacticsSchema }),
]);

export const LiveMatchSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('fixture'), fixtureId: z.string().min(1), changes: z.array(MatchChangeSchema) }),
  z.strictObject({
    kind: z.literal('friendly'),
    opponentId: ClubIdSchema,
    venue: SideSchema,
    seed: z.int().min(0),
    changes: z.array(MatchChangeSchema),
  }),
]);
export type LiveMatch = z.infer<typeof LiveMatchSchema>;

/** What the user can decide mid-match (the side is filled in from the fixture). */
export type UserChange = { kind: 'substitution'; offId: PlayerId; onId: PlayerId } | { kind: 'tactics'; tactics: Tactics };

/** The career state a live match is rebuilt from. */
export type LiveContext = {
  db: GameDatabase;
  season: Season;
  condition: ConditionState;
  currentDate: string;
  userClubId: ClubId;
  lineup: Lineup;
  tactics: Tactics;
};

export type LiveView = {
  input: MatchInput;
  result: MatchResult;
  /** The user's side. */
  side: Side;
  /** Set for league and cup fixtures. */
  fixtureId: string | null;
};

/** Rebuilds the live match, including every change made so far. Throws if it no longer matches the career. */
export function liveView(ctx: LiveContext, live: LiveMatch): LiveView {
  const user = { clubId: ctx.userClubId, lineup: ctx.lineup, tactics: ctx.tactics, changes: live.changes };
  if (live.kind === 'fixture') {
    const prepared = prepareUserFixture(ctx.db, ctx.season, user, ctx.condition);
    if (prepared.fixture.id !== live.fixtureId) throw new RangeError('The match in progress is no longer your next fixture');
    return { input: prepared.input, result: prepared.result, side: prepared.side, fixtureId: live.fixtureId };
  }
  const input = prepareFriendly({
    db: ctx.db,
    userClubId: ctx.userClubId,
    lineup: ctx.lineup,
    tactics: ctx.tactics,
    opponentId: live.opponentId,
    venue: live.venue,
    seed: live.seed,
    condition: conditionOn(ctx.condition, ctx.currentDate),
    changes: live.changes,
  });
  return { input, result: simulateMatch(input), side: live.venue, fixtureId: null };
}

/** Who's on, who's left and the current tactics, at the clock the replay is paused at. */
export const snapshotAt = (view: LiveView, at: MatchClock): MatchSnapshot => matchSnapshot(view.input, at);

/**
 * Adds a change made at `after`. Changes must be made in match order (a
 * change can't go back before an earlier one), and must be possible at that
 * moment (player on the pitch, on the bench, substitutions left).
 */
export function addChange(view: LiveView, live: LiveMatch, after: MatchClock, change: UserChange): LiveMatch {
  const last = live.changes.at(-1);
  if (last && clockKey(after) < clockKey(last.after)) throw new RangeError('Changes must be made in match order');
  const full: MatchChange = { ...change, after, side: view.side };
  const problem = changeProblem(view.input, full);
  if (problem) throw new RangeError(problem);
  return { ...live, changes: [...live.changes, full] };
}

/** The clock to resume a reloaded match at: just after the last change (or kick-off). */
export const resumeClock = (live: LiveMatch): MatchClock => live.changes.at(-1)?.after ?? { minute: 0 };
