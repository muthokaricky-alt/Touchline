import type { AttributeKey, PlayerId } from '@/data/schemas';
import { clamp } from '@/utils/math';
import { createRng } from '@/utils/random';

import type { Side } from './types';

/**
 * Penalty shootout for knockout ties that end level. Pure and seeded.
 *
 * Format: five kicks each, alternating (home first); stops early once one
 * side can't be caught; then sudden death, one kick each, until a round
 * separates them. Takers go in order of penalty skill and cycle round.
 */

export type ShootoutPlayer = { id: PlayerId; attrs: Record<AttributeKey, number> };

export type ShootoutInput = {
  /** Outfield players still on the pitch; best takers first is not required. */
  home: readonly ShootoutPlayer[];
  away: readonly ShootoutPlayer[];
  homeKeeper: ShootoutPlayer | null;
  awayKeeper: ShootoutPlayer | null;
  seed: number;
};

export type ShootoutKick = { side: Side; takerId: PlayerId; scored: boolean };
export type ShootoutResult = { home: number; away: number; winner: Side; kicks: ShootoutKick[] };

const takerSkill = (p: ShootoutPlayer) => (p.attrs.finishing + p.attrs.composure) / 2;
const keeperSkill = (k: ShootoutPlayer | null) => (k ? (k.attrs.reflexes + k.attrs.oneOnOnes) / 2 : 5);

/** Chance a kick goes in: ~76% for an average taker vs an average keeper. */
export function kickSuccessChance(taker: ShootoutPlayer, keeper: ShootoutPlayer | null): number {
  return clamp(0.76 + 0.012 * (takerSkill(taker) - 12) - 0.012 * (keeperSkill(keeper) - 12), 0.55, 0.92);
}

export function simulateShootout({ home, away, homeKeeper, awayKeeper, seed }: ShootoutInput): ShootoutResult {
  if (home.length === 0 || away.length === 0) throw new RangeError('Both sides need at least one penalty taker');
  const rng = createRng(seed);
  const order = (players: readonly ShootoutPlayer[]) => [...players].sort((a, b) => takerSkill(b) - takerSkill(a) || (a.id < b.id ? -1 : 1));
  const takers = { home: order(home), away: order(away) };
  const keepers = { home: homeKeeper, away: awayKeeper };
  const score = { home: 0, away: 0 };
  const kicks: ShootoutKick[] = [];

  const kick = (side: Side, index: number) => {
    const list = takers[side];
    const taker = list[index % list.length];
    const scored = rng.next() < kickSuccessChance(taker, keepers[side === 'home' ? 'away' : 'home']);
    if (scored) score[side]++;
    kicks.push({ side, takerId: taker.id, scored });
  };

  // Best of five: stop as soon as the trailing side can't catch up.
  for (let round = 0; round < 5; round++) {
    kick('home', round);
    if (decided(score, round + 1, round)) break;
    kick('away', round);
    if (decided(score, round + 1, round + 1)) break;
  }
  // Sudden death.
  for (let round = 5; score.home === score.away; round++) {
    kick('home', round);
    kick('away', round);
  }
  return { ...score, winner: score.home > score.away ? 'home' : 'away', kicks };
}

/** Has one side an unassailable lead, given kicks taken so far (out of 5 each)? */
function decided(score: { home: number; away: number }, homeTaken: number, awayTaken: number): boolean {
  return score.home > score.away + (5 - awayTaken) || score.away > score.home + (5 - homeTaken);
}
