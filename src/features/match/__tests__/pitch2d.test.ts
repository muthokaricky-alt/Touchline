import { simulateMatch } from '@/engine/simulate';
import type { MatchResult } from '@/engine/types';
import { CLUBS, team } from '@/engine/__fixtures__/helpers';

import { buildPitchFrames } from '../pitch2d';

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
    expect(frame.goal).toBe('home');
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
