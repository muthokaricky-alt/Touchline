import { buildAiTeam } from '@/game/ai/opponent';
import type { Tactics } from '@/game/tactics/tactics';

import { simulateMatch } from '../simulate';
import type { MatchResult, MatchTeamInput } from '../types';
import { aggregate, CLUBS, db, mirror, simulateMany, team } from '../__fixtures__/helpers';

/**
 * Statistical tests: simulate many matches and check the AVERAGES look like
 * football. Individual matches are random; these checks are about the
 * engine's tendencies. Ranges are deliberately a little wider than real-world
 * figures so harmless tuning tweaks don't break the build, but tight enough
 * to catch a broken engine.
 *
 * Fixed seeds keep these tests deterministic (same numbers every run).
 *
 * If you retune the engine, run `npx jest calibration --verbose` and read
 * the printed tables.
 */

const mid = team(CLUBS.middle);
/** An identical copy of `mid` with renamed player ids: a perfectly equal opponent. */
const midCopy = mirror(mid);
const strong = team(CLUBS.strongest);
const weak = team(CLUBS.weakest);

describe('calibration: equal teams', () => {
  const stats = aggregate(simulateMany(1200, (seed) => ({ home: mid, away: midCopy, seed })));

  it('prints the averages', () => {
    console.log('Equal teams (Greywater v Greywater):', stats);
  });

  it('scores a realistic number of goals', () => {
    expect(stats.goalsPerMatch).toBeGreaterThan(2.2);
    expect(stats.goalsPerMatch).toBeLessThan(3.0);
    expect(stats.nilNilPct).toBeGreaterThan(3);
    expect(stats.nilNilPct).toBeLessThan(12);
  });

  it('has home advantage', () => {
    expect(stats.homeWinPct).toBeGreaterThan(stats.awayWinPct + 8);
    expect(stats.homeWinPct).toBeGreaterThan(40);
    expect(stats.homeWinPct).toBeLessThan(55);
    expect(stats.drawPct).toBeGreaterThan(18);
    expect(stats.drawPct).toBeLessThan(32);
  });

  it('has realistic shots, accuracy and conversion', () => {
    expect(stats.shotsPerTeam).toBeGreaterThan(9);
    expect(stats.shotsPerTeam).toBeLessThan(15);
    expect(stats.onTargetPct).toBeGreaterThan(32);
    expect(stats.onTargetPct).toBeLessThan(45);
    expect(stats.conversionPct).toBeGreaterThan(8);
    expect(stats.conversionPct).toBeLessThan(13);
  });

  it('has realistic discipline', () => {
    expect(stats.foulsPerMatch).toBeGreaterThan(15);
    expect(stats.foulsPerMatch).toBeLessThan(26);
    expect(stats.yellowsPerMatch).toBeGreaterThan(2.5);
    expect(stats.yellowsPerMatch).toBeLessThan(4.5);
    expect(stats.redsPerMatch).toBeGreaterThan(0.03);
    expect(stats.redsPerMatch).toBeLessThan(0.3);
  });

  it('makes substitutions', () => {
    expect(stats.subsPerTeam).toBeGreaterThan(2.5);
    expect(stats.subsPerTeam).toBeLessThanOrEqual(5);
  });
});

describe('calibration: team strength', () => {
  const strongAtHome = aggregate(simulateMany(500, (seed) => ({ home: strong, away: weak, seed })));
  const weakAtHome = aggregate(simulateMany(500, (seed) => ({ home: weak, away: strong, seed })));

  it('prints the averages', () => {
    console.log('Strongest v weakest:', strongAtHome, '\nWeakest v strongest:', weakAtHome);
  });

  it('lets the stronger side win most, but not all, matches', () => {
    expect(strongAtHome.homeWinPct).toBeGreaterThan(70);
    expect(strongAtHome.homeWinPct).toBeLessThan(92);
    expect(strongAtHome.awayWinPct).toBeGreaterThan(1);
    expect(weakAtHome.awayWinPct).toBeGreaterThan(55);
    expect(weakAtHome.homeWinPct).toBeGreaterThan(5);
  });

  it('gives the stronger side more of the ball', () => {
    expect(strongAtHome.homePossession).toBeGreaterThan(55);
    expect(weakAtHome.homePossession).toBeLessThan(50);
  });

  it('keeps goals per match believable in a mismatch', () => {
    expect(strongAtHome.goalsPerMatch).toBeLessThan(4);
  });
});

describe('calibration: AI league', () => {
  // Every club vs every other, AI-chosen formation and style.
  const teams = db.clubs.map((c) => buildAiTeam(db, c.id, 13));
  const pairs = teams.flatMap((h) => teams.filter((a) => a !== h).map((a) => [h, a] as const));
  const stats = aggregate(
    simulateMany(pairs.length * 6, (seed) => {
      const [home, away] = pairs[seed % pairs.length];
      return { home, away, seed };
    }),
  );

  it('prints the averages', () => {
    console.log('AI round robin:', stats);
  });

  it('averages a believable number of goals', () => {
    expect(stats.goalsPerMatch).toBeGreaterThan(2.3);
    expect(stats.goalsPerMatch).toBeLessThan(3.5);
  });
});

/**
 * Tactics: the same two squads play the same seeds; only the home side's
 * instructions change. Differences therefore come from the tactics alone.
 */
describe('calibration: tactics change the game in the expected direction', () => {
  const COUNT = 400;
  const run = (tactics: Partial<Tactics>): MatchResult[] => {
    const home: MatchTeamInput = team(CLUBS.middle, tactics);
    return Array.from({ length: COUNT }, (_, i) => simulateMatch({ home, away: midCopy, seed: 5000 + i }));
  };
  const avg = (results: MatchResult[], f: (r: MatchResult) => number) => results.reduce((s, r) => s + f(r), 0) / results.length;
  const homeEnergy = (r: MatchResult) => {
    const finishers = r.players.filter((p) => p.side === 'home' && p.started && p.position !== 'GK');
    return finishers.reduce((s, p) => s + p.energy, 0) / finishers.length;
  };

  const baseline = run({});
  const possession = run({ passing: 'short', tempo: 'slow' });
  const allOut = run({ mentality: 'very-attacking' });
  const parkTheBus = run({ mentality: 'very-defensive', defensiveLine: 'deep' });
  const highPress = run({ pressing: 'high' });

  it('short passing and slow tempo keep the ball', () => {
    expect(avg(possession, (r) => r.stats.home.possession)).toBeGreaterThan(avg(baseline, (r) => r.stats.home.possession) + 4);
  });

  it('very attacking creates more shots and concedes more', () => {
    expect(avg(allOut, (r) => r.stats.home.shots)).toBeGreaterThan(avg(baseline, (r) => r.stats.home.shots) + 0.8);
    expect(avg(allOut, (r) => r.stats.away.shots)).toBeGreaterThan(avg(baseline, (r) => r.stats.away.shots) + 0.8);
  });

  it('very defensive with a deep line concedes fewer shots but creates fewer', () => {
    expect(avg(parkTheBus, (r) => r.stats.away.shots)).toBeLessThan(avg(baseline, (r) => r.stats.away.shots) - 0.8);
    expect(avg(parkTheBus, (r) => r.stats.home.shots)).toBeLessThan(avg(baseline, (r) => r.stats.home.shots) - 0.8);
  });

  it('high pressing wins the ball but costs fouls and energy', () => {
    expect(avg(highPress, (r) => r.stats.home.possession)).toBeGreaterThan(avg(baseline, (r) => r.stats.home.possession));
    expect(avg(highPress, (r) => r.stats.home.fouls)).toBeGreaterThan(avg(baseline, (r) => r.stats.home.fouls) + 1);
    expect(avg(highPress, homeEnergy)).toBeLessThan(avg(baseline, homeEnergy) - 3);
  });
});
