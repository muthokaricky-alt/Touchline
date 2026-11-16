import type { ClubId, PlayerId, Position } from '@/data/schemas';
import type { Lineup, LineupCandidate } from '@/game/lineup';
import type { Tactics } from '@/game/tactics/tactics';

/**
 * Match engine types.
 *
 * Design rule: the simulation produces EVENTS (plus possession counts and
 * appearances). Everything else (score, team stats, player stats, ratings)
 * is derived from those events by `summarise.ts`, so a stat can never
 * disagree with the timeline.
 */

export type Side = 'home' | 'away';

export const otherSide = (side: Side): Side => (side === 'home' ? 'away' : 'home');

export type MatchTeamInput = {
  clubId: ClubId;
  name: string;
  lineup: Lineup;
  tactics: Tactics;
  /** Every player available to this team (starters, bench, reserves) with attributes. */
  squad: readonly LineupCandidate[];
  /** Fitness (starting energy) and morale by player. Missing → fresh, neutral morale. */
  condition?: Readonly<Record<PlayerId, PlayerMatchCondition>>;
};

/** A player's state going into a match, both 0–100. */
export type PlayerMatchCondition = { fitness: number; morale: number };

export type MatchInput = {
  home: MatchTeamInput;
  away: MatchTeamInput;
  /** Same seed + same input → identical match. */
  seed: number;
  /** The managers' decisions during the match, in the order they were made. */
  changes?: readonly MatchChange[];
};

/**
 * A manager's decision during a match. It takes effect from the first
 * minute AFTER `after` (the clock the manager paused at), so everything up
 * to and including `after` plays out exactly as it did without it: same
 * seed, same random numbers in the same order. That's what lets the game
 * re-simulate the whole match after each change and carry the replay on
 * from where it was.
 */
export type MatchChange = { after: MatchClock; side: Side } & (
  | { kind: 'substitution'; offId: PlayerId; onId: PlayerId }
  | { kind: 'tactics'; tactics: Tactics }
);

/** A team as it stands at a moment in the match (for the in-match management screen). */
export type TeamSnapshot = {
  onPitch: { id: PlayerId; position: Position; energy: number; booked: boolean }[];
  bench: PlayerId[];
  subsLeft: number;
  tactics: Tactics;
  /** True once the manager has made a change: the assistant stops making fatigue substitutions. */
  manual: boolean;
};

export type MatchSnapshot = {
  clock: MatchClock;
  score: Score;
  /** No minutes left to play: changes would have no effect. */
  finished: boolean;
  teams: Record<Side, TeamSnapshot>;
};

export type ChanceType = 'through-ball' | 'cross' | 'long-ball' | 'long-shot' | 'set-piece';

/** Match clock. In stoppage time `minute` stays at 45/90 and `addedTime` counts up. */
export type MatchClock = { minute: number; addedTime?: number };

export type MatchEvent = MatchClock &
  (
    | { type: 'kick-off' }
    | { type: 'half-time'; score: Score }
    | { type: 'full-time'; score: Score }
    | {
        type: 'goal';
        side: Side;
        scorerId: PlayerId;
        assistId: PlayerId | null;
        chance: ChanceType;
        xg: number;
        /** Score after this goal. */
        score: Score;
      }
    | {
        type: 'shot';
        side: Side;
        shooterId: PlayerId;
        chance: ChanceType;
        xg: number;
        outcome: 'saved' | 'off-target' | 'blocked';
        /** Keeper for saves, defender for blocks. */
        defenderId: PlayerId | null;
        corner: boolean;
      }
    | { type: 'tackle'; side: Side; playerId: PlayerId }
    | { type: 'foul'; side: Side; playerId: PlayerId; victimId: PlayerId }
    | { type: 'card'; side: Side; playerId: PlayerId; card: 'yellow' | 'second-yellow' | 'red' }
    | { type: 'substitution'; side: Side; offId: PlayerId; onId: PlayerId; reason: SubstitutionReason }
    /** The manager changed instructions (an in-match change). */
    | { type: 'tactics'; side: Side; tactics: Tactics }
    /** `days`: how long he'll be out (the game layer turns it into a return date). */
    | { type: 'injury'; side: Side; playerId: PlayerId; days: number }
  );

export type MatchEventType = MatchEvent['type'];

/** 'manager': the user's own change; the others are made automatically. */
export type SubstitutionReason = 'fatigue' | 'goalkeeper' | 'injury' | 'manager';

export type Score = { home: number; away: number };

/** Who played, where, and when. Derived minutes come from these. */
export type Appearance = {
  playerId: PlayerId;
  side: Side;
  /** Slot position they started in or came on for. */
  position: Position;
  started: boolean;
  /** Display minute they came on (0 for starters). */
  onMinute: number;
  /** Display minute they went off (sub or red card), null if they finished the match. */
  offMinute: number | null;
};

/** Raw output of the simulation, before summarising. */
export type SimulationOutput = {
  events: MatchEvent[];
  appearances: Appearance[];
  /** Minutes each side had the ball. */
  possessionMinutes: Record<Side, number>;
  /** Energy (0–100) of every player who appeared, at their last minute on the pitch. */
  finalEnergy: Record<PlayerId, number>;
};

export type TeamMatchStats = {
  /** 0–100, whole number; home + away = 100. */
  possession: number;
  shots: number;
  shotsOnTarget: number;
  /** Expected goals, 2 decimals. */
  xg: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
};

export type PlayerMatchStats = {
  playerId: PlayerId;
  side: Side;
  position: Position;
  started: boolean;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  saves: number;
  tackles: number;
  fouls: number;
  yellowCards: number;
  redCard: boolean;
  goalsConceded: number;
  /** Energy at the end of their time on the pitch, 0–100. */
  energy: number;
  /** 3.0–10.0, one decimal. */
  rating: number;
};

export type MatchResult = {
  seed: number;
  home: { clubId: ClubId; name: string };
  away: { clubId: ClubId; name: string };
  score: Score;
  events: MatchEvent[];
  stats: Record<Side, TeamMatchStats>;
  players: PlayerMatchStats[];
  playerOfTheMatch: PlayerId | null;
  /** Knockout ties level after 90 minutes: shootout score (added by the competition layer, not the engine). */
  penalties?: { home: number; away: number };
};
