import type { PlayerId } from '@/data/schemas';

import { playerRating } from './ratings';
import {
  otherSide,
  type Appearance,
  type MatchEvent,
  type MatchInput,
  type MatchResult,
  type PlayerMatchStats,
  type Side,
  type SimulationOutput,
  type TeamMatchStats,
} from './types';

/**
 * Derives everything in a MatchResult from the simulation's events. The
 * score is counted from goal events, stats from shot/foul/card events, and
 * so on: one source of truth, no chance of the numbers disagreeing.
 */
export function summarise(input: MatchInput, sim: SimulationOutput): MatchResult {
  const goals = sim.events.filter((e) => e.type === 'goal');
  const score = {
    home: goals.filter((g) => g.side === 'home').length,
    away: goals.filter((g) => g.side === 'away').length,
  };

  const stats = { home: emptyTeamStats(), away: emptyTeamStats() };
  const totalPossession = sim.possessionMinutes.home + sim.possessionMinutes.away;
  stats.home.possession = totalPossession > 0 ? Math.round((100 * sim.possessionMinutes.home) / totalPossession) : 50;
  stats.away.possession = 100 - stats.home.possession;

  const players = new Map<PlayerId, Omit<PlayerMatchStats, 'rating'>>();
  for (const a of sim.appearances) {
    players.set(a.playerId, {
      playerId: a.playerId,
      side: a.side,
      position: a.position,
      started: a.started,
      minutesPlayed: Math.max(0, (a.offMinute ?? 90) - a.onMinute),
      goals: 0,
      assists: 0,
      shots: 0,
      shotsOnTarget: 0,
      saves: 0,
      tackles: 0,
      fouls: 0,
      yellowCards: 0,
      redCard: false,
      goalsConceded: 0,
      energy: Math.round(sim.finalEnergy[a.playerId] ?? 100),
    });
  }
  const bump = (id: PlayerId | null, field: 'goals' | 'assists' | 'shots' | 'shotsOnTarget' | 'saves' | 'tackles' | 'fouls' | 'yellowCards' | 'goalsConceded') => {
    const p = id ? players.get(id) : undefined;
    if (p) p[field]++;
  };

  for (const event of sim.events) {
    switch (event.type) {
      case 'goal': {
        const team = stats[event.side];
        team.shots++;
        team.shotsOnTarget++;
        team.xg += event.xg;
        bump(event.scorerId, 'goals');
        bump(event.scorerId, 'shots');
        bump(event.scorerId, 'shotsOnTarget');
        bump(event.assistId, 'assists');
        for (const id of onPitchAt(sim.appearances, otherSide(event.side), event.minute)) bump(id, 'goalsConceded');
        break;
      }
      case 'shot': {
        const team = stats[event.side];
        team.shots++;
        team.xg += event.xg;
        if (event.corner) team.corners++;
        bump(event.shooterId, 'shots');
        if (event.outcome === 'saved') {
          team.shotsOnTarget++;
          bump(event.shooterId, 'shotsOnTarget');
          bump(event.defenderId, 'saves');
        } else if (event.outcome === 'blocked') {
          bump(event.defenderId, 'tackles');
        }
        break;
      }
      case 'tackle':
        bump(event.playerId, 'tackles');
        break;
      case 'foul':
        stats[event.side].fouls++;
        bump(event.playerId, 'fouls');
        break;
      case 'card': {
        const p = players.get(event.playerId);
        if (event.card === 'yellow' || event.card === 'second-yellow') {
          stats[event.side].yellowCards++;
          bump(event.playerId, 'yellowCards');
        }
        if (event.card === 'red' || event.card === 'second-yellow') {
          stats[event.side].redCards++;
          if (p) p.redCard = true;
        }
        break;
      }
      default:
        break;
    }
  }
  for (const side of ['home', 'away'] as const) stats[side].xg = Math.round(stats[side].xg * 100) / 100;

  const rated: PlayerMatchStats[] = [...players.values()].map((p) => ({
    ...p,
    rating: playerRating({ ...p, teamGoals: score[p.side], opponentGoals: score[otherSide(p.side)] }),
  }));

  return {
    seed: input.seed,
    home: { clubId: input.home.clubId, name: input.home.name },
    away: { clubId: input.away.clubId, name: input.away.name },
    score,
    events: sim.events,
    stats,
    players: rated,
    playerOfTheMatch: pickPlayerOfTheMatch(rated),
  };
}

function emptyTeamStats(): TeamMatchStats {
  return { possession: 50, shots: 0, shotsOnTarget: 0, xg: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 };
}

/** Players of `side` on the pitch at display minute `minute`. */
function onPitchAt(appearances: readonly Appearance[], side: Side, minute: number): PlayerId[] {
  return appearances
    .filter((a) => a.side === side && a.onMinute <= minute && (a.offMinute === null || a.offMinute > minute))
    .map((a) => a.playerId);
}

/** Highest rating; ties go to more goals, then more assists, then the earlier id. */
function pickPlayerOfTheMatch(players: readonly PlayerMatchStats[]): PlayerId | null {
  const best = [...players].sort(
    (a, b) => b.rating - a.rating || b.goals - a.goals || b.assists - a.assists || (a.playerId < b.playerId ? -1 : 1),
  )[0];
  return best?.playerId ?? null;
}

/** Narrowing helper used by consumers that only care about some event types. */
export function eventsOfType<T extends MatchEvent['type']>(events: readonly MatchEvent[], type: T): Extract<MatchEvent, { type: T }>[] {
  return events.filter((e): e is Extract<MatchEvent, { type: T }> => e.type === type);
}
