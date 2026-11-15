import type { AttributeKey } from '@/data/schemas';

import { kickSuccessChance, simulateShootout, type ShootoutPlayer } from '../penalties';

function player(id: string, skill: number): ShootoutPlayer {
  const attrs = new Proxy({} as Record<AttributeKey, number>, { get: () => skill });
  return { id, attrs };
}
const team = (prefix: string, skill: number) => Array.from({ length: 10 }, (_, i) => player(`${prefix}${i}`, skill));

describe('penalty shootout', () => {
  it('always produces a winner with a valid score', () => {
    for (let seed = 0; seed < 300; seed++) {
      const r = simulateShootout({ home: team('h', 12), away: team('a', 12), homeKeeper: player('hk', 12), awayKeeper: player('ak', 12), seed });
      expect(r.home).not.toBe(r.away);
      expect(r.winner).toBe(r.home > r.away ? 'home' : 'away');
      expect(r.kicks.filter((k) => k.scored && k.side === 'home')).toHaveLength(r.home);
      // Alternating kicks: home never more than one kick ahead of away.
      const homeKicks = r.kicks.filter((k) => k.side === 'home').length;
      const awayKicks = r.kicks.filter((k) => k.side === 'away').length;
      expect(homeKicks - awayKicks).toBeGreaterThanOrEqual(0);
      expect(homeKicks - awayKicks).toBeLessThanOrEqual(1);
    }
  });

  it('stops exactly when the first five kicks each can no longer change the outcome', () => {
    // Replay each shootout kick by kick. Within the first 10 kicks, it must
    // end at the first moment one side can't be caught, and not before.
    // (Kick success is clamped to 55–92%, so outcomes are always uncertain.)
    let earlyFinishes = 0;
    for (let seed = 0; seed < 400; seed++) {
      const r = simulateShootout({ home: team('h', 14), away: team('a', 10), homeKeeper: player('hk', 12), awayKeeper: player('ak', 12), seed });
      const regulation = r.kicks.slice(0, 10);
      const score = { home: 0, away: 0 };
      const taken = { home: 0, away: 0 };
      let decidedAt = -1;
      regulation.forEach((k, i) => {
        taken[k.side]++;
        if (k.scored) score[k.side]++;
        const decided = score.home > score.away + (5 - taken.away) || score.away > score.home + (5 - taken.home);
        if (decided && decidedAt === -1) decidedAt = i;
      });
      if (decidedAt !== -1) {
        expect(r.kicks).toHaveLength(decidedAt + 1);
        if (decidedAt < 9) earlyFinishes++;
      } else {
        expect(r.kicks.length).toBeGreaterThanOrEqual(10);
      }
    }
    expect(earlyFinishes).toBeGreaterThan(0);
  });

  it('is deterministic and roughly 3 in 4 kicks go in for average players', () => {
    const input = { home: team('h', 12), away: team('a', 12), homeKeeper: player('hk', 12), awayKeeper: player('ak', 12) };
    expect(simulateShootout({ ...input, seed: 9 })).toEqual(simulateShootout({ ...input, seed: 9 }));
    let scored = 0;
    let taken = 0;
    for (let seed = 0; seed < 500; seed++) {
      const r = simulateShootout({ ...input, seed });
      scored += r.kicks.filter((k) => k.scored).length;
      taken += r.kicks.length;
    }
    expect(scored / taken).toBeGreaterThan(0.7);
    expect(scored / taken).toBeLessThan(0.82);
  });

  it('favours better takers and better keepers', () => {
    expect(kickSuccessChance(player('t', 18), player('k', 10))).toBeGreaterThan(kickSuccessChance(player('t', 8), player('k', 10)));
    expect(kickSuccessChance(player('t', 12), player('k', 18))).toBeLessThan(kickSuccessChance(player('t', 12), player('k', 6)));
  });

  it('needs takers on both sides', () => {
    expect(() => simulateShootout({ home: [], away: team('a', 12), homeKeeper: null, awayKeeper: null, seed: 1 })).toThrow(RangeError);
  });
});
