import { simulateMatch } from '@/engine/simulate';
import type { MatchResult } from '@/engine/types';
import { CLUBS, team } from '@/engine/__fixtures__/helpers';

import { buildBuildUps, buildPassingPlay, buildPitchFrames, BUILD_UP_STEP_MS, PASS_STEP_MS } from '../pitch2d';
import { buildTimeline } from '../timeline';

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

describe('buildPassingPlay', () => {
  const shownOf = (r: MatchResult) => buildTimeline(r, (id) => id).map((item) => Number(item.key));

  it('fills the gaps between shown moments with 1-10 steps on the pitch, the ball always at a highlighted holder', () => {
    const result = play(21);
    const shown = shownOf(result);
    const plays = buildPassingPlay(result, shown);
    expect(plays.size).toBeGreaterThan(shown.length / 2);
    for (const [index, frames] of plays) {
      expect(shown).toContain(index);
      expect(frames.length).toBeGreaterThanOrEqual(1);
      expect(frames.length).toBeLessThanOrEqual(10); // up to 9 passes, plus a restart
      for (const frame of frames) {
        const holder = frame.dots.find((d) => d.highlight)!;
        expect(Math.hypot(holder.x - frame.ball.x, holder.y - frame.ball.y)).toBeLessThan(0.05);
        expect(count(frame, 'home')).toBeLessThanOrEqual(11);
        for (const d of [...frame.dots, frame.ball]) {
          expect(d.x).toBeGreaterThanOrEqual(0);
          expect(d.x).toBeLessThanOrEqual(1);
          expect(d.y).toBeGreaterThanOrEqual(0);
          expect(d.y).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(buildPassingPlay(result, shown)).toEqual(plays); // deterministic
  });

  it('has the ball with the team whose chance comes next, and none during the half-time break', () => {
    const result = play(21);
    const shown = shownOf(result);
    const plays = buildPassingPlay(result, shown);
    for (const [index, frames] of plays) {
      const next = result.events[index];
      if (next.type === 'shot' || next.type === 'goal') {
        expect(frames.at(-1)!.dots.find((d) => d.highlight)!.side).toBe(next.side);
      }
      expect(next.type).not.toBe('kick-off');
    }
  });

  it('gives the ball to the defending keeper after a save or a shot off target', () => {
    const result = play(21);
    const shown = shownOf(result);
    const plays = buildPassingPlay(result, shown);
    let checked = 0;
    shown.forEach((index, k) => {
      const event = result.events[index];
      const after = plays.get(shown[k + 1]);
      if (event.type !== 'shot' || event.outcome === 'blocked' || !after) return;
      const keeper = result.players.find((p) => p.side !== event.side && p.position === 'GK' && p.started)!;
      // The keeper starts it (his first pass is the first frame), from his own end.
      const first = after[0];
      const ownEnd = event.side === 'home' ? first.ball.x > 0.5 : first.ball.x < 0.5;
      expect(ownEnd).toBe(true);
      expect(first.dots.find((d) => d.highlight)!.side).not.toBe(event.side);
      expect(keeper).toBeDefined();
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('restarts from the centre spot with the team that conceded', () => {
    const { result } = findMatch((m) => m.events.findIndex((e) => e.type === 'goal' && e.minute < 80));
    const shown = shownOf(result);
    const plays = buildPassingPlay(result, shown);
    const goalAt = shown.find((i) => result.events[i].type === 'goal' && result.events[i].minute < 80)!;
    const goal = result.events[goalAt] as Extract<MatchResult['events'][number], { type: 'goal' }>;
    const after = plays.get(shown[shown.indexOf(goalAt) + 1]);
    if (!after) return; // the next line was a kick-off or a whistle
    expect(after[0].dots.find((d) => d.highlight)!.side).toBe(goal.side === 'home' ? 'away' : 'home');
    expect(Math.abs(after[0].ball.x - 0.5)).toBeLessThan(0.3);
  });

  it('ends each passing move exactly where the next moment starts, so nothing jumps across the pitch', () => {
    const result = play(21);
    const shown = shownOf(result);
    const plays = buildPassingPlay(result, shown);
    const buildUps = buildBuildUps(result);
    const frames = buildPitchFrames(result);
    let checked = 0;
    for (const [index, passes] of plays) {
      const start = buildUps.get(index)?.[0] ?? frames.get(index)!;
      const event = result.events[index];
      // Moments in open play (chances, fouls, cards): the last pass lands on the spot.
      if (!buildUps.has(index) && !['card', 'foul', 'tackle'].includes(event.type)) continue;
      expect(passes.at(-1)!.ball).toEqual(start.ball);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('never jumps: in the order the screen shows them, the ball only moves a pass length between frames (long balls aside)', () => {
    for (const seed of [3, 21, 40, 55, 77]) {
      const r = play(seed);
      const shown = shownOf(r);
      const frames = buildPitchFrames(r);
      const plays = buildPassingPlay(r, shown);
      const buildUps = buildBuildUps(r);
      let previous = frames.get(shown[0])!;
      for (const index of shown.slice(1)) {
        const event = r.events[index];
        const longBall = (event.type === 'shot' || event.type === 'goal') && event.chance === 'long-ball';
        const sequence = [...(plays.get(index) ?? []), ...(buildUps.get(index) ?? []), frames.get(index)!];
        for (const frame of sequence) {
          const jump = Math.hypot(frame.ball.x - previous.ball.x, frame.ball.y - previous.ball.y);
          // Whistles reset to the centre spot; long balls are meant to be long.
          if (event.type !== 'half-time' && event.type !== 'full-time' && event.type !== 'kick-off' && !longBall) expect(jump).toBeLessThan(0.62);
          previous = frame;
        }
      }
    }
  });

  it('a 2D match at normal speed lasts about one and a half to two and a half minutes', () => {
    // The screen's timing: each line waits 1 s (after a goal 3 s), plus its passing play and build-up.
    for (const seed of [3, 21, 40]) {
      const result = play(seed);
      const shown = shownOf(result);
      const plays = buildPassingPlay(result, shown);
      const buildUps = buildBuildUps(result);
      const ms = shown.reduce((sum, index, k) => {
        const previousGoal = k > 0 && result.events[shown[k - 1]].type === 'goal';
        return sum + (previousGoal ? 3000 : 1000) + (plays.get(index)?.length ?? 0) * PASS_STEP_MS + (buildUps.get(index)?.length ?? 0) * BUILD_UP_STEP_MS;
      }, 0);
      console.log(`seed ${seed}: ${shown.length} lines, ${(ms / 1000).toFixed(0)} s`);
      expect(ms).toBeGreaterThan(80_000);
      expect(ms).toBeLessThan(160_000);
    }
  });
});
