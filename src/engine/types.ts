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
};

export type MatchInput = {
  home: MatchTeamInput;
  away: MatchTeamInput;
  /** Same seed + same input → identical match. */
  seed: number;
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
    | { type: 'substitution'; side: Side; offId: PlayerId; onId: PlayerId; reason: 'fatigue' | 'goalkeeper' }
  );

export type MatchEventType = MatchEvent['type'];

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
};
