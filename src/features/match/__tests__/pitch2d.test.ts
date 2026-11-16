import { simulateMatch } from '@/engine/simulate';
import type { MatchResult } from '@/engine/types';
import { CLUBS, team } from '@/engine/__fixtures__/helpers';

import { buildBuildUps, buildPitchFrames } from '../pitch2d';

const home = team(CLUBS.middle);
const away = team(CLUBS.strongest);
const play = (seed: number): MatchResult => simulateMatch({ home, away, seed });

/** The first seed (from 1) whose match has an event matching `wanted`. */
function findMatch(wanted: (r: MatchResult) => number): { result: MatchResult; index: number } {
  for (let seed = 1; seed < 400; seed++) {
    const result = play(seed);
    const index = wanted(result);
    if (index >= 0) return { result, index };
  }
  throw new Error('No match found with that event');
}

const count = (frame: { dots: { side: string }[] }, side: string) => frame.dots.filter((d) => d.side === side).length;

describe('buildPitchFrames', () => {
  const result = play(7);
  const frames = buildPitchFrames(result);

  it('has a frame for every event, with everyone on the pitch and the ball at kick-off on the centre spot', () => {
    expect(frames.size).toBe(result.events.length);
    const kickOff = frames.get(0)!;
    expect(count(kickOff, 'home')).toBe(11);
    expect(count(kickOff, 'away')).toBe(11);
    expect(kickOff.ball).toEqual({ x: 0.5, y: 0.5 });
    for (const frame of frames.values()) {
      for (const d of [...frame.dots, frame.ball]) {
        expect(d.x).toBeGreaterThanOrEqual(0);
        expect(d.x).toBeLessThanOrEqual(1);
        expect(d.y).toBeGreaterThanOrEqual(0);
        expect(d.y).toBeLessThanOrEqual(1);
      }
    }
    expect(buildPitchFrames(result)).toEqual(frames); // deterministic
  });

  it('keeps each team on its own side at kick-off: home on the left, away on the right', () => {
    const kickOff = frames.get(0)!;
    expect(kickOff.dots.filter((d) => d.side === 'home').every((d) => d.x < 0.5)).toBe(true);
    expect(kickOff.dots.filter((d) => d.side === 'away').every((d) => d.x > 0.5)).toBe(true);
  });

  it('puts the ball at the scoring end for a goal, the scorer at it, and pushes the scoring team up', () => {
    const { result: r, index } = findMatch((m) => m.events.findIndex((e) => e.type === 'goal' && e.side === 'home'));
    const goal = r.events[index] as Extract<(typeof r.events)[number], { type: 'goal' }>;
    const frame = buildPitchFrames(r).get(index)!;
    expect(frame.goal).toEqual({ side: 'home', scorerId: goal.scorerId, assistId: goal.assistId });
    expect(frame.ball.x).toBeGreaterThan(0.9);
    const scorer = frame.dots.find((d) => d.playerId === goal.scorerId)!;
    expect(scorer.highlight).toBe(true);
    expect(Math.abs(scorer.x - frame.ball.x)).toBeLessThan(0.05);
    const meanX = (f: typeof frame) => {
      const outfield = f.dots.filter((d) => d.side === 'home' && d.x > 0.12);
      return outfield.reduce((s, d) => s + d.x, 0) / outfield.length;
    };
    expect(meanX(frame)).toBeGreaterThan(meanX(buildPitchFrames(r).get(0)!));
  });

  it('follows substitutions and sendings-off', () => {
    const sub = findMatch((m) => m.events.findIndex((e) => e.type === 'substitution'));
    const subEvent = sub.result.events[sub.index] as Extract<(typeof sub.result.events)[number], { type: 'substitution' }>;
    const after = buildPitchFrames(sub.result).get(sub.index)!;
    expect(after.dots.some((d) => d.playerId === subEvent.onId)).toBe(true);
    expect(after.dots.some((d) => d.playerId === subEvent.offId)).toBe(false);
    expect(count(after, subEvent.side)).toBe(11);

    const red = findMatch((m) => m.events.findIndex((e) => e.type === 'card' && e.card !== 'yellow'));
    const redEvent = red.result.events[red.index] as Extract<(typeof red.result.events)[number], { type: 'card' }>;
    const sentOff = buildPitchFrames(red.result).get(red.index)!;
    expect(count(sentOff, redEvent.side)).toBe(10);
    expect(sentOff.dots.some((d) => d.playerId === redEvent.playerId)).toBe(false);
  });
});

describe('buildBuildUps', () => {
  type Shot = Extract<MatchResult['events'][number], { type: 'shot' | 'goal' }>;
  const shooterOf = (e: Shot) => (e.type === 'goal' ? e.scorerId : e.shooterId);

  it('gives every shot and goal a short build-up ending with the shooter on the ball, moving towards goal', () => {
    const result = play(11);
    const buildUps = buildBuildUps(result);
    const shots = result.events.flatMap((e, i) => (e.type === 'shot' || e.type === 'goal' ? [[e, i] as const] : []));
    expect(shots.length).toBeGreaterThan(0);
    for (const [event, index] of shots) {
      const frames = buildUps.get(index)!;
      expect(frames.length).toBeGreaterThanOrEqual(2);
      expect(frames.length).toBeLessThanOrEqual(3);
      const last = frames.at(-1)!;
      const holder = last.dots.find((d) => d.highlight)!;
      expect(holder.playerId).toBe(shooterOf(event));
      // The shot comes from the attacked half.
      const towardsGoal = (x: number) => (event.side === 'home' ? x : 1 - x);
      expect(towardsGoal(last.ball.x)).toBeGreaterThan(0.6);
      if (event.chance !== 'set-piece') expect(towardsGoal(last.ball.x)).toBeGreaterThan(towardsGoal(frames[0].ball.x));
      expect(count(last, 'home')).toBeLessThanOrEqual(11);
    }
  });

  it('involves the assister in an assisted goal, and starts a set piece at the corner flag', () => {
    const assisted = findMatch((m) => m.events.findIndex((e) => e.type === 'goal' && e.assistId !== null && e.chance !== 'long-shot'));
    const goal = assisted.result.events[assisted.index] as Extract<MatchResult['events'][number], { type: 'goal' }>;
    const frames = buildBuildUps(assisted.result).get(assisted.index)!;
    expect(frames.some((f) => f.dots.some((d) => d.highlight && d.playerId === goal.assistId))).toBe(true);

    const setPiece = findMatch((m) => m.events.findIndex((e) => (e.type === 'shot' || e.type === 'goal') && e.chance === 'set-piece'));
    const first = buildBuildUps(setPiece.result).get(setPiece.index)![0];
    expect(Math.min(first.ball.y, 1 - first.ball.y)).toBeLessThan(0.05); // on the byline at a corner
    expect(Math.min(first.ball.x, 1 - first.ball.x)).toBeLessThan(0.05);
  });
});
