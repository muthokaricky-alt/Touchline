import type { PlayerId, Position } from '@/data/schemas';
import { describeEvent, formatClock } from '@/engine/commentary';
import type { MatchClock, MatchEvent, MatchResult, Score, Side, TeamMatchStats } from '@/engine/types';

/**
 * Pure helpers that shape a finished MatchResult for the match screen:
 * which events to show in the feed, the running score, stat rows and
 * rating colours. No React here, so it's all unit-tested.
 */

export type TimelineKind = 'goal' | 'chance' | 'card' | 'substitution' | 'tactics' | 'injury' | 'whistle';

export type TimelineItem = {
  key: string;
  /** When it happened: in-match changes are made "after" the clock of the item the replay is showing. */
  at: MatchClock;
  clock: string;
  kind: TimelineKind;
  side: Side | null;
  text: string;
  /** Score after this item (unchanged unless it's a goal). */
  score: Score;
  /** Phase of the match once this item has happened. */
  phase: 'first-half' | 'half-time' | 'second-half' | 'full-time';
};

/** Shots worth showing: on target, blocked, or a decent chance that went wide. */
const NOTABLE_MISS_XG = 0.15;

function kindOf(event: MatchEvent): TimelineKind | null {
  switch (event.type) {
    case 'goal':
      return 'goal';
    case 'shot':
      return event.outcome !== 'off-target' || event.xg >= NOTABLE_MISS_XG ? 'chance' : null;
    case 'card':
      return 'card';
    case 'substitution':
      return 'substitution';
    case 'tactics':
      return 'tactics';
    case 'injury':
      return 'injury';
    case 'kick-off':
    case 'half-time':
    case 'full-time':
      return 'whistle';
    default:
      // Tackles and plain fouls happen ~50 times a match: too noisy for the feed.
      return null;
  }
}

/** The phase an event belongs to, read straight from the event. */
function phaseOf(event: MatchEvent): TimelineItem['phase'] {
  if (event.type === 'half-time') return 'half-time';
  if (event.type === 'full-time') return 'full-time';
  return event.minute > 45 ? 'second-half' : 'first-half';
}

export function buildTimeline(result: MatchResult, playerName: (id: PlayerId) => string): TimelineItem[] {
  const ctx = { playerName, teamName: (side: Side) => result[side].name };
  let score: Score = { home: 0, away: 0 };
  const items: TimelineItem[] = [];

  result.events.forEach((event, index) => {
    if (event.type === 'goal') score = event.score;
    const kind = kindOf(event);
    if (!kind) return;
    items.push({
      key: `${index}`,
      at: event.addedTime ? { minute: event.minute, addedTime: event.addedTime } : { minute: event.minute },
      clock: formatClock(event),
      kind,
      side: 'side' in event ? event.side : null,
      text: describeEvent(event, ctx),
      score,
      phase: phaseOf(event),
    });
  });
  return items;
}

export type StatRow = { label: string; home: string; away: string; /** Home share 0–1, for the bar. */ homeShare: number };

export function buildStatRows(stats: Record<Side, TeamMatchStats>): StatRow[] {
  const row = (label: string, home: number, away: number, format: (n: number) => string = String): StatRow => ({
    label,
    home: format(home),
    away: format(away),
    homeShare: home + away > 0 ? home / (home + away) : 0.5,
  });
  return [
    row('Possession', stats.home.possession, stats.away.possession, (n) => `${n}%`),
    row('Shots', stats.home.shots, stats.away.shots),
    row('On target', stats.home.shotsOnTarget, stats.away.shotsOnTarget),
    row('Expected goals', stats.home.xg, stats.away.xg, (n) => n.toFixed(2)),
    row('Corners', stats.home.corners, stats.away.corners),
    row('Fouls', stats.home.fouls, stats.away.fouls),
    row('Yellow cards', stats.home.yellowCards, stats.away.yellowCards),
    row('Red cards', stats.home.redCards, stats.away.redCards),
  ];
}

/** Colour band for a 3–10 match rating. */
export type MatchRatingTone = 'excellent' | 'good' | 'average' | 'poor';

export function matchRatingTone(rating: number): MatchRatingTone {
  if (rating >= 7.5) return 'excellent';
  if (rating >= 6.5) return 'good';
  if (rating >= 5.5) return 'average';
  return 'poor';
}

export type RatingRow = {
  id: PlayerId;
  name: string;
  position: Position;
  started: boolean;
  minutes: number;
  goals: number;
  assists: number;
  card: 'yellow' | 'red' | null;
  rating: number;
  tone: MatchRatingTone;
  playerOfTheMatch: boolean;
};

/** One side's players: starters first (best rating first), then substitutes. */
export function buildRatingRows(result: MatchResult, side: Side, playerName: (id: PlayerId) => string): RatingRow[] {
  return result.players
    .filter((p) => p.side === side)
    .sort((a, b) => Number(b.started) - Number(a.started) || b.rating - a.rating)
    .map((p) => ({
      id: p.playerId,
      name: playerName(p.playerId),
      position: p.position,
      started: p.started,
      minutes: p.minutesPlayed,
      goals: p.goals,
      assists: p.assists,
      card: p.redCard ? 'red' : p.yellowCards > 0 ? 'yellow' : null,
      rating: p.rating,
      tone: matchRatingTone(p.rating),
      playerOfTheMatch: p.playerId === result.playerOfTheMatch,
    }));
}

/** Short status for the scoreboard. */
export function phaseLabel(phase: TimelineItem['phase']): string {
  return { 'first-half': 'Live', 'half-time': 'Half-time', 'second-half': 'Live', 'full-time': 'Full-time' }[phase];
}
