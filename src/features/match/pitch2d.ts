import type { PlayerId, Position } from '@/data/schemas';
import type { ChanceType, MatchEvent, MatchResult, Side } from '@/engine/types';

/**
 * The 2D match view's frames (pure; no React). The engine simulates events,
 * not player positions, so the pitch is ILLUSTRATIVE: for each commentary
 * item we work out who's on the pitch, each team's shape for the moment
 * (pushed up when attacking, dropped back when defending) and where the ball
 * is, and the screen animates from one frame to the next.
 *
 * Coordinates (a horizontal pitch): x 0 = the home goal (left) → 1 = the away
 * goal (right); y 0 = top touchline → 1 = bottom. Home attacks to the right.
 * Shapes come from each player's position in the match (works for any
 * formation, and for players who came on).
 */

export type Phase = 'attacking' | 'defending' | 'neutral';

export type PitchDot = {
  playerId: PlayerId;
  side: Side;
  x: number;
  y: number;
  /** The player the moment is about (scorer, shooter, booked player). */
  highlight: boolean;
};

export type PitchGoal = { side: Side; scorerId: PlayerId; assistId: PlayerId | null };

export type PitchFrame = {
  ball: { x: number; y: number };
  dots: PitchDot[];
  /** A goal: who scored (the screen shows a banner). */
  goal: PitchGoal | null;
};

/** How far forward a position plays (0 = centre-back line … 1 = striker line). */
const DEPTH: Record<Position, number> = {
  GK: 0,
  CB: 0,
  LB: 0.08,
  RB: 0.08,
  LWB: 0.22,
  RWB: 0.22,
  DM: 0.3,
  CM: 0.45,
  LM: 0.55,
  RM: 0.55,
  AM: 0.68,
  LW: 0.8,
  RW: 0.8,
  ST: 1,
};

/** Across the pitch from the team's own left (0) to right (1): a band that duplicates share. */
const WIDTH: Record<Position, readonly [number, number]> = {
  GK: [0.5, 0.5],
  CB: [0.32, 0.68],
  LB: [0.12, 0.12],
  RB: [0.88, 0.88],
  LWB: [0.1, 0.1],
  RWB: [0.9, 0.9],
  DM: [0.4, 0.6],
  CM: [0.3, 0.7],
  LM: [0.12, 0.12],
  RM: [0.88, 0.88],
  AM: [0.38, 0.62],
  LW: [0.15, 0.15],
  RW: [0.85, 0.85],
  ST: [0.38, 0.62],
};

/** Where the outfield block sits along the pitch (team's own direction, 0 = own goal) in each phase. */
const BLOCK: Record<Phase, readonly [number, number]> = {
  neutral: [0.16, 0.47],
  attacking: [0.36, 0.8],
  defending: [0.12, 0.5],
};
const KEEPER: Record<Phase, number> = { neutral: 0.04, attacking: 0.1, defending: 0.035 };

type OnPitch = { playerId: PlayerId; position: Position };

/** Small deterministic variety (same event → same spot), 0–1. */
function jitter(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  return (h % 1000) / 1000;
}

/** A team's dots for a phase, in pitch coordinates (mirrored for the away side). */
function shape(side: Side, players: readonly OnPitch[], phase: Phase): PitchDot[] {
  const [lo, hi] = BLOCK[phase];
  const count = new Map<Position, number>();
  for (const p of players) count.set(p.position, (count.get(p.position) ?? 0) + 1);
  const seen = new Map<Position, number>();
  return players.map((p) => {
    const index = seen.get(p.position) ?? 0;
    seen.set(p.position, index + 1);
    const n = count.get(p.position)!;
    const [a, b] = WIDTH[p.position];
    const lateral = n === 1 ? (a + b) / 2 : a === b ? a + (index - (n - 1) / 2) * 0.12 : a + ((b - a) * index) / (n - 1);
    const along = p.position === 'GK' ? KEEPER[phase] : lo + DEPTH[p.position] * (hi - lo);
    // Home attacks right: its left side is the top of the screen. Away is mirrored both ways.
    return side === 'home'
      ? { playerId: p.playerId, side, x: along, y: lateral, highlight: false }
      : { playerId: p.playerId, side, x: 1 - along, y: 1 - lateral, highlight: false };
  });
}

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');
/** x of the goal a side attacks. */
const attackingGoalX = (side: Side) => (side === 'home' ? 1 : 0);
/** Along the pitch towards `side`'s attacking goal: fraction t of the way (0 = its own goal). */
const towards = (side: Side, t: number) => (side === 'home' ? t : 1 - t);

/**
 * Walks the events in order, keeping track of who's on the pitch: `visit`
 * gets each event with the line-ups after it (substitutions, red cards and
 * injuries applied).
 */
function walkLineUps(result: MatchResult, visit: (event: MatchEvent, index: number, onPitch: Record<Side, readonly OnPitch[]>) => void): void {
  const positionOf = new Map(result.players.map((p) => [p.playerId, p.position]));
  const onPitch: Record<Side, OnPitch[]> = {
    home: result.players.filter((p) => p.side === 'home' && p.started).map((p) => ({ playerId: p.playerId, position: p.position })),
    away: result.players.filter((p) => p.side === 'away' && p.started).map((p) => ({ playerId: p.playerId, position: p.position })),
  };
  const remove = (side: Side, id: PlayerId) => {
    onPitch[side] = onPitch[side].filter((p) => p.playerId !== id);
  };
  result.events.forEach((event, index) => {
    if (event.type === 'substitution') {
      const slot = onPitch[event.side].find((p) => p.playerId === event.offId)?.position ?? positionOf.get(event.onId) ?? 'CM';
      remove(event.side, event.offId);
      onPitch[event.side].push({ playerId: event.onId, position: positionOf.get(event.onId) ?? slot });
    } else if (event.type === 'card' && event.card !== 'yellow') {
      remove(event.side, event.playerId);
    } else if (event.type === 'injury') {
      remove(event.side, event.playerId);
    }
    visit(event, index, onPitch);
  });
}

/**
 * One frame per event of the match (keyed by its index in `result.events`,
 * which is the commentary item's key). Who's on the pitch follows the
 * substitutions, red cards and injuries up to and including that event.
 */
export function buildPitchFrames(result: MatchResult): Map<number, PitchFrame> {
  const frames = new Map<number, PitchFrame>();
  let ball = { x: 0.5, y: 0.5 };
  walkLineUps(result, (event, index, onPitch) => {
    const moment = momentOf(event, `${index}`, ball);
    ball = moment.ball;
    const phase = (side: Side): Phase => (moment.attacking === null ? 'neutral' : moment.attacking === side ? 'attacking' : 'defending');
    const dots = [...shape('home', onPitch.home, phase('home')), ...shape('away', onPitch.away, phase('away'))];
    // The player the moment is about stands at the ball (a little behind it).
    if (moment.focus) {
      const dot = dots.find((d) => d.playerId === moment.focus);
      if (dot) {
        dot.highlight = true;
        dot.x = dot.side === 'home' ? ball.x - 0.03 : ball.x + 0.03;
        dot.y = ball.y;
      }
    }
    const goal = event.type === 'goal' ? { side: event.side, scorerId: event.scorerId, assistId: event.assistId } : null;
    frames.set(index, { ball, dots: dots.map(clampDot), goal });
  });
  return frames;
}

// --- Build-ups (2D step B) ---------------------------------------------------------------
//
// For every shot and goal: a few keyframes of the move that led to it, played
// BEFORE its commentary line appears (so the line never gives a goal away
// early). The path follows the kind of chance the engine recorded.

/** Time each build-up keyframe is shown (the dots glide between them). */
export const BUILD_UP_STEP_MS = 520;

/** A ball holder: who, how far up the pitch (0 = own goal … 1 = the goal attacked), and across (0 top … 1 bottom). */
type Touch = { playerId: PlayerId; t: number; y: number };

const MIDFIELD: readonly Position[] = ['CM', 'DM', 'AM', 'LM', 'RM'];
const DEFENCE: readonly Position[] = ['CB', 'LB', 'RB', 'LWB', 'RWB', 'DM'];
const WIDE: readonly Position[] = ['LW', 'RW', 'LM', 'RM', 'LWB', 'RWB', 'LB', 'RB'];

/** The first player (not excluded) in one of `positions`, or any outfielder, or null. */
function pick(players: readonly OnPitch[], positions: readonly Position[], exclude: readonly PlayerId[], key: string): PlayerId | null {
  const pool = players.filter((p) => p.position !== 'GK' && !exclude.includes(p.playerId));
  const preferred = pool.filter((p) => positions.includes(p.position));
  const from = preferred.length ? preferred : pool;
  return from.length ? from[Math.floor(jitter(key) * from.length)].playerId : null;
}

/** The touches leading to a shot by `shooter`, by chance type (the last touch is the shooter's). */
function buildUpPath(
  chance: ChanceType,
  players: readonly OnPitch[],
  shooter: PlayerId,
  assist: PlayerId | null,
  key: string,
): Touch[] {
  const wing = jitter(key + 'w') < 0.5 ? 0.12 : 0.88;
  const centre = 0.42 + jitter(key + 'c') * 0.16;
  const helper = (positions: readonly Position[], salt: string) => pick(players, positions, [shooter, ...(assist ? [assist] : [])], key + salt);
  const steps: (Touch | null)[] = (() => {
    switch (chance) {
      case 'cross': {
        const crosser = assist ?? helper(WIDE, 'x');
        const starter = helper(DEFENCE, 's');
        return [
          starter ? { playerId: starter, t: 0.38, y: wing < 0.5 ? 0.2 : 0.8 } : null,
          crosser ? { playerId: crosser, t: 0.84, y: wing } : null,
          { playerId: shooter, t: 0.9, y: centre },
        ];
      }
      case 'long-ball': {
        const starter = helper(['CB', 'DM'], 's');
        return [starter ? { playerId: starter, t: 0.22, y: centre } : null, assist ? { playerId: assist, t: 0.6, y: centre } : null, { playerId: shooter, t: 0.82, y: centre }];
      }
      case 'long-shot': {
        const starter = helper(MIDFIELD, 's');
        return [starter ? { playerId: starter, t: 0.5, y: 0.3 + jitter(key + 'l') * 0.4 } : null, assist ? { playerId: assist, t: 0.64, y: centre } : null, { playerId: shooter, t: 0.72, y: centre }];
      }
      case 'set-piece': {
        const taker = assist ?? helper(MIDFIELD, 't');
        return [taker ? { playerId: taker, t: 0.995, y: wing < 0.5 ? 0.01 : 0.99 } : null, { playerId: shooter, t: 0.92, y: centre }];
      }
      case 'through-ball':
      default: {
        const starter = helper(['DM', 'CM'], 's');
        const passer = assist ?? helper(['AM', 'CM', 'LW', 'RW'], 'p');
        return [
          starter ? { playerId: starter, t: 0.45, y: centre } : null,
          passer ? { playerId: passer, t: 0.66, y: 0.35 + jitter(key + 'p') * 0.3 } : null,
          { playerId: shooter, t: 0.86, y: centre },
        ];
      }
    }
  })();
  return steps.filter((s): s is Touch => s !== null);
}

/**
 * Build-up keyframes for every shot and goal, keyed by event index. Each
 * keyframe: the attacking team pushed up, the defending team back, the ball
 * with the player on it (highlighted), moving towards goal.
 */
export function buildBuildUps(result: MatchResult): Map<number, PitchFrame[]> {
  const buildUps = new Map<number, PitchFrame[]>();
  walkLineUps(result, (event, index, onPitch) => {
    if (event.type !== 'goal' && event.type !== 'shot') return;
    const side = event.side;
    const shooter = event.type === 'goal' ? event.scorerId : event.shooterId;
    const assist = event.type === 'goal' ? event.assistId : null;
    const path = buildUpPath(event.chance, onPitch[side], shooter, assist, `${index}`);
    const base = [...shape(side, onPitch[side], 'attacking'), ...shape(other(side), onPitch[other(side)], 'defending')];
    buildUps.set(
      index,
      path.map((touch) => {
        const ball = { x: towards(side, touch.t), y: touch.y };
        const dots = base.map((d) =>
          d.playerId === touch.playerId
            ? { ...d, highlight: true, x: side === 'home' ? ball.x - 0.025 : ball.x + 0.025, y: ball.y }
            : { ...d },
        );
        return { ball: { x: clamp(ball.x), y: clamp(ball.y) }, dots: dots.map(clampDot), goal: null };
      }),
    );
  });
  return buildUps;
}

type Moment = { attacking: Side | null; ball: { x: number; y: number }; focus: PlayerId | null };

/** Which side is on the ball, where the ball is, and whose moment it is. */
function momentOf(event: MatchEvent, key: string, previousBall: { x: number; y: number }): Moment {
  const across = 0.36 + jitter(key) * 0.28;
  switch (event.type) {
    case 'kick-off':
    case 'half-time':
    case 'full-time':
      return { attacking: null, ball: { x: 0.5, y: 0.5 }, focus: null };
    case 'goal':
      return { attacking: event.side, ball: { x: towards(event.side, 0.985), y: 0.44 + jitter(key) * 0.12 }, focus: event.scorerId };
    case 'shot': {
      const goal = attackingGoalX(event.side);
      if (event.outcome === 'saved') return { attacking: event.side, ball: { x: towards(event.side, 0.95), y: across }, focus: event.shooterId };
      if (event.outcome === 'blocked') return { attacking: event.side, ball: { x: towards(event.side, 0.82), y: across }, focus: event.shooterId };
      // Off target: just wide of the post.
      return { attacking: event.side, ball: { x: goal === 1 ? 0.995 : 0.005, y: jitter(key) < 0.5 ? 0.36 : 0.64 }, focus: event.shooterId };
    }
    case 'card':
    case 'foul':
      // The offender's side was defending: the ball is in its half.
      return { attacking: other(event.side), ball: { x: towards(other(event.side), 0.55 + jitter(key) * 0.25), y: across }, focus: event.playerId };
    case 'tackle':
      return { attacking: event.side, ball: { x: towards(event.side, 0.3 + jitter(key) * 0.3), y: across }, focus: event.playerId };
    default:
      // Substitutions, injuries, tactics changes: play has stopped; the ball stays where it was.
      return { attacking: null, ball: previousBall, focus: null };
  }
}

// --- Passing play (between moments) --------------------------------------------------------
//
// Between two commentary lines the dots used to stand still. Now the team on
// the ball passes it around: a chain of passes to nearby teammates, mostly
// forward, with both teams sliding with the ball and the nearest opponent
// pressing. Illustrative like the rest: the engine decides what happens; this
// only fills the time between its moments.

/** Time each pass is shown (the dots glide between passes). */
export const PASS_STEP_MS = 600;
/** Most passes shown between two lines. */
const MAX_PASSES = 6;
/** A pass goes to a teammate about this far away (pitch units). */
const PASS_LENGTH = 0.2;

type Ball = { x: number; y: number };

/** The minute on the clock, counting added time (45+2 → 47). */
const clockOf = (event: MatchEvent) => event.minute + (event.addedTime ?? 0);

const distance = (a: Ball, b: Ball) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * A team on the ball near `ball`: both shapes slide with the ball (along the
 * pitch and towards its side), the holder stands on it, and the nearest
 * opponent closes him down. `holder` null: nobody on the ball yet.
 */
function playFrame(side: Side, onPitch: Record<Side, readonly OnPitch[]>, ball: Ball, holder: PlayerId | null): PitchFrame {
  // How far the ball is up the pitch, from the attacking team's point of view (0 own goal … 1 their goal).
  const t = side === 'home' ? ball.x : 1 - ball.x;
  const slideAlong = (t - 0.5) * 0.4;
  const slideAcross = (ball.y - 0.5) * 0.3;
  const keepers = new Set([...onPitch.home, ...onPitch.away].filter((p) => p.position === 'GK').map((p) => p.playerId));
  const dots = [...shape(side, onPitch[side], 'attacking'), ...shape(other(side), onPitch[other(side)], 'defending')].map((d) => {
    const keeper = keepers.has(d.playerId);
    const along = (keeper ? 0.15 : 1) * slideAlong;
    return { ...d, x: d.x + (side === 'home' ? along : -along), y: keeper ? d.y : d.y + slideAcross };
  });
  const own = holder ? dots.find((d) => d.playerId === holder) : undefined;
  if (own) {
    own.highlight = true;
    own.x = side === 'home' ? ball.x - 0.02 : ball.x + 0.02;
    own.y = ball.y;
  }
  // The nearest outfield opponent steps towards the ball.
  const presser = nearestTo(
    dots.filter((d) => d.side !== side && !keepers.has(d.playerId)),
    ball,
  );
  if (presser) {
    presser.x += (ball.x - presser.x) * 0.55;
    presser.y += (ball.y - presser.y) * 0.55;
  }
  return { ball: { x: clamp(ball.x), y: clamp(ball.y) }, dots: dots.map(clampDot), goal: null };
}

function nearestTo(dots: readonly PitchDot[], at: Ball): PitchDot | null {
  let best: PitchDot | null = null;
  for (const d of dots) if (!best || distance(d, at) < distance(best, at)) best = d;
  return best;
}

/**
 * The next holder: a teammate about a pass length away, preferably moving
 * the ball towards `targetT` (how far up the pitch the move should end),
 * never the keeper unless the ball is near his own goal. Deterministic per `key`.
 */
function nextHolder(frame: PitchFrame, side: Side, keeper: PlayerId | undefined, holder: PlayerId, targetT: number, key: string): PitchDot | null {
  const t = (x: number) => (side === 'home' ? x : 1 - x);
  let best: PitchDot | null = null;
  let bestScore = -Infinity;
  for (const d of frame.dots) {
    if (d.side !== side || d.playerId === holder) continue;
    if (d.playerId === keeper && t(frame.ball.x) > 0.2) continue;
    const length = distance(d, frame.ball);
    const progress = t(d.x) - t(frame.ball.x);
    // Close to a normal pass length, towards the target, with a little deterministic variety.
    const score = -Math.abs(length - PASS_LENGTH) * 3 - Math.abs(t(d.x) - targetT) * 1.2 + progress * 0.4 + jitter(key + d.playerId) * 0.35;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Passing play before each shown item, keyed by the item's event index (like
 * buildBuildUps). `shown` lists the event indexes the commentary shows, in
 * order; play fills each gap between two of them, one pass per ~2 minutes of
 * match time (1–6). None after half-time or full-time, or before a kick-off
 * (play has stopped).
 *
 * Who has the ball: the team on it at the last moment (after a goal, the
 * team that conceded, from the centre spot). If the next moment belongs to
 * the other team, they win it about half-way through.
 */
export function buildPassingPlay(result: MatchResult, shown: readonly number[]): Map<number, PitchFrame[]> {
  const moments: Moment[] = [];
  const lineUps: Record<Side, OnPitch[]>[] = [];
  let lastBall: Ball = { x: 0.5, y: 0.5 };
  walkLineUps(result, (event, index, onPitch) => {
    const moment = momentOf(event, `${index}`, lastBall);
    lastBall = moment.ball;
    moments[index] = moment;
    lineUps[index] = { home: [...onPitch.home], away: [...onPitch.away] };
  });

  const plays = new Map<number, PitchFrame[]>();
  for (let k = 1; k < shown.length; k++) {
    const from = shown[k - 1];
    const to = shown[k];
    const before = result.events[from];
    const next = result.events[to];
    if (before.type === 'half-time' || before.type === 'full-time' || next.type === 'kick-off') continue;
    const minutes = Math.max(1, Math.min(MAX_PASSES, Math.round((clockOf(next) - clockOf(before)) / 2)));
    const onPitch = lineUps[from];
    const key = `p${to}`;
    const keeperOf = (s: Side) => onPitch[s].find((p) => p.position === 'GK')?.playerId;
    // The outfielder of `s` nearest the ball (when nobody was named at the last moment, or on a turnover).
    const nearest = (s: Side, at: Ball) =>
      nearestTo(
        playFrame(s, onPitch, at, null).dots.filter((d) => d.side === s && d.playerId !== keeperOf(s)),
        at,
      )?.playerId ?? null;

    // Who starts on the ball, and where.
    let side: Side;
    let ball: Ball;
    let holder: PlayerId | null;
    if (before.type === 'goal') {
      side = other(before.side);
      ball = { x: 0.5, y: 0.5 };
      holder = pick(onPitch[side], ['ST', 'AM', 'CM'], [], key + 'k');
    } else if (before.type === 'shot') {
      // The defending side restarts: the keeper after a save or a shot off target (goal kick), whoever is nearest after a block.
      side = other(before.side);
      if (before.outcome === 'blocked') {
        ball = moments[from].ball;
        holder = null;
      } else {
        ball = { x: towards(side, 0.06), y: 0.5 };
        holder = keeperOf(side) ?? null;
      }
    } else {
      side = moments[from].attacking ?? moments[to].attacking ?? (jitter(key) < 0.5 ? 'home' : 'away');
      ball = moments[from].ball;
      const focus = moments[from].focus;
      holder = focus && onPitch[side].some((p) => p.playerId === focus) ? focus : null;
    }
    holder ??= nearest(side, ball);
    if (!holder) continue;
    const nextSide = moments[to].attacking ?? side;
    // Keep the move in midfield; a build-up (if a chance follows) takes it from there.
    const targetT = 0.5;
    // When the ball changes hands, the side that starts makes at least one pass first (so a keeper's restart is seen).
    const passes = nextSide === side ? minutes : Math.max(2, minutes);
    const turnoverAt = nextSide === side ? -1 : Math.max(1, Math.floor(passes / 2));

    const frames: PitchFrame[] = [];
    for (let i = 0; i < passes; i++) {
      if (i === turnoverAt) {
        // The other side wins it where the ball is.
        side = nextSide;
        holder = nearest(side, ball) ?? holder;
        frames.push(playFrame(side, onPitch, ball, holder));
        continue;
      }
      const frame = playFrame(side, onPitch, ball, holder);
      const receiver = nextHolder(frame, side, keeperOf(side), holder, targetT, `${key}-${i}`);
      if (!receiver) break;
      holder = receiver.playerId;
      ball = { x: receiver.x, y: receiver.y };
      frames.push(playFrame(side, onPitch, ball, holder));
    }
    if (frames.length) plays.set(to, frames);
  }
  return plays;
}

const clamp = (n: number) => Math.min(0.985, Math.max(0.015, n));
const clampDot = (d: PitchDot): PitchDot => ({ ...d, x: clamp(d.x), y: clamp(d.y) });
