import type { PlayerId } from '@/data/schemas';

import { simulateMatch } from '../simulate';
import { moraleFactor, NEUTRAL_MORALE } from '../team-state';
import type { MatchResult, MatchTeamInput, PlayerMatchCondition } from '../types';
import { CLUBS, mirror, simulateMany, team } from '../__fixtures__/helpers';

/**
 * Condition going into a match (Milestone 8): starting fitness, morale and
 * injuries. Statistical checks use fixed seeds, like calibration.test.ts.
 */

const mid = team(CLUBS.middle);
const midCopy = mirror(mid);

/** The same team with every player at `condition`. */
function withCondition(input: MatchTeamInput, condition: PlayerMatchCondition): MatchTeamInput {
  const map: Record<PlayerId, PlayerMatchCondition> = {};
  for (const c of input.squad) map[c.player.id] = condition;
  return { ...input, condition: map };
}

const homeWinPct = (results: readonly MatchResult[]) => (100 * results.filter((r) => r.score.home > r.score.away).length) / results.length;
const injuriesIn = (r: MatchResult) => r.events.filter((e) => e.type === 'injury');

describe('injuries', () => {
  const results = simulateMany(1500, (seed) => ({ home: mid, away: midCopy, seed }));
  const injuries = results.flatMap(injuriesIn);

  it('happen at a realistic rate (~0.12 per team per match)', () => {
    const perTeam = injuries.length / (results.length * 2);
    console.log('Injuries per team per match:', perTeam.toFixed(3));
    expect(perTeam).toBeGreaterThan(0.06);
    expect(perTeam).toBeLessThan(0.2);
  });

  it('last from a few days to a few months, mostly short', () => {
    const days = injuries.map((e) => (e.type === 'injury' ? e.days : 0));
    expect(Math.min(...days)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...days)).toBeLessThanOrEqual(90);
    expect(days.filter((d) => d <= 10).length / days.length).toBeGreaterThan(0.35);
  });

  it('take the injured player off for good', () => {
    for (const r of results) {
      for (const e of injuriesIn(r)) {
        if (e.type !== 'injury') continue;
        const line = r.players.find((p) => p.playerId === e.playerId)!;
        // He went off in the injury minute and never came back on.
        expect(line.minutesPlayed).toBeLessThanOrEqual(Math.min(90, e.minute));
        const after = r.events.filter((x) => x.minute > e.minute || (x.minute === e.minute && x !== e));
        expect(after.some((x) => x.type === 'substitution' && x.onId === e.playerId)).toBe(false);
      }
    }
  });

  it('bring on a substitute when one is left', () => {
    const forced = results.flatMap((r) => r.events.filter((e) => e.type === 'substitution' && e.reason === 'injury'));
    expect(forced.length).toBeGreaterThan(injuries.length * 0.8);
  });
});

describe('fitness and morale', () => {
  const baseline = homeWinPct(simulateMany(600, (seed) => ({ home: mid, away: midCopy, seed })));

  it('a fresh, neutral condition changes nothing', () => {
    const plain = simulateMatch({ home: mid, away: midCopy, seed: 5 });
    const explicit = simulateMatch({
      home: withCondition(mid, { fitness: 100, morale: NEUTRAL_MORALE }),
      away: withCondition(midCopy, { fitness: 100, morale: NEUTRAL_MORALE }),
      seed: 5,
    });
    expect(explicit).toEqual(plain);
  });

  it('a tired side starts below full energy and does worse', () => {
    const tired = withCondition(mid, { fitness: 70, morale: NEUTRAL_MORALE });
    const r = simulateMatch({ home: tired, away: midCopy, seed: 1 });
    expect(r.players.filter((p) => p.side === 'home' && p.started).every((p) => p.energy < 70)).toBe(true);
    const pct = homeWinPct(simulateMany(600, (seed) => ({ home: tired, away: midCopy, seed })));
    console.log(`Home win %: fresh ${baseline.toFixed(1)}, at 70% fitness ${pct.toFixed(1)}`);
    expect(pct).toBeLessThan(baseline - 5);
  });

  it('morale helps a little, less than fitness', () => {
    const happy = homeWinPct(simulateMany(600, (seed) => ({ home: withCondition(mid, { fitness: 100, morale: 100 }), away: midCopy, seed })));
    const low = homeWinPct(simulateMany(600, (seed) => ({ home: withCondition(mid, { fitness: 100, morale: 10 }), away: midCopy, seed })));
    console.log(`Home win %: morale 100 ${happy.toFixed(1)}, morale 10 ${low.toFixed(1)}`);
    expect(happy).toBeGreaterThan(low);
    expect(moraleFactor(100)).toBeCloseTo(1.03);
    expect(moraleFactor(undefined)).toBe(1);
  });
});
