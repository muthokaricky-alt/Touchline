import type { GameDatabase, Player, PlayerAttributes, PlayerId } from '@/data/schemas';
import { ageOn } from '@/utils/date';
import { createRng } from '@/utils/random';

import { mixSeed } from '../season/season';
import { playerAbility } from '../transfers/valuation';

/**
 * Potential: how good a player can become (Milestone 8b).
 *
 * A game-design judgement layered on top of the generated data, so it lives
 * here rather than in the data generator: it needs the real ability (a game
 * concept) and must not consume the generator's random numbers (that would
 * rename and reshuffle every existing player). Each player gets their own
 * seeded random stream instead.
 */

/** Headroom above current ability, by age: [min, max]. Older players are what they are. */
const HEADROOM_BY_AGE: Record<number, readonly [number, number]> = {
  16: [3, 8], 17: [3, 8], 18: [2.5, 7], 19: [2, 6], 20: [1.5, 5], 21: [1, 4], 22: [0.5, 3], 23: [0.5, 2.5], 24: [0, 1.5], 25: [0, 1], 26: [0, 1],
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function headroom(age: number, roll: number): number {
  const [min, max] = HEADROOM_BY_AGE[Math.max(16, age)] ?? [0, 0];
  // Skewed towards the low end: big talents are rarer than modest ones.
  return min + (max - min) * roll ** 1.4;
}

/** Gives every player a potential (unless one is already set). Deterministic for a seed. */
export function assignPotential<T extends Pick<GameDatabase, 'players' | 'attributes'>>(db: T, seed: number, onDate: string): T {
  const attributes = new Map(db.attributes.map((a) => [a.playerId, a]));
  return {
    ...db,
    players: db.players.map((player) => {
      if (player.potential !== undefined) return player;
      const attrs = attributes.get(player.id);
      if (!attrs) return player;
      const rng = createRng(mixSeed(seed, Number(player.id.slice(4)) + 7_000_000));
      const ability = playerAbility(player, attrs);
      return { ...player, potential: Math.min(20, round1(ability + headroom(ageOn(player.dateOfBirth, onDate), rng.next()))) };
    }),
  };
}

/** The ceiling development works towards: never below what he already is. */
export function potentialOf(player: Pick<Player, 'potential' | 'primaryPosition'>, attributes: PlayerAttributes): number {
  return Math.max(player.potential ?? 0, playerAbility(player, attributes));
}

/**
 * How well the user knows a player's potential (see game/scouting):
 * 0 not scouted, 1 scouted (or one of their own players), 2 full report.
 */
export type Knowledge = 0 | 1 | 2;

/** Half-width of the range the user sees, by knowledge. */
const RANGE_WIDTH: Record<Knowledge, number> = { 0: 3, 1: 1, 2: 0 };

/**
 * What the user sees: a range around the true potential, ±3 for players
 * nobody has scouted, ±1 once scouted (and for the user's own players),
 * exact with a full report. The estimate's centre is off by a fixed,
 * deterministic amount per player (at most half the width), so the range
 * always contains the truth. It never starts below his current ability
 * (rounded) or ends above 20.
 */
export function potentialRange(playerId: PlayerId, potential: number, ability: number, knowledge: Knowledge): { low: number; high: number } {
  let h = 2166136261;
  for (let i = 0; i < playerId.length; i++) h = Math.imul(h ^ playerId.charCodeAt(i), 16777619) >>> 0;
  const width = RANGE_WIDTH[knowledge];
  const offset = ((h % 1000) / 1000 - 0.5) * width; // the estimate's centre is a little off
  const centre = potential + offset;
  const low = Math.max(Math.round(ability), Math.round(centre - width));
  const high = Math.min(20, Math.max(low, Math.round(centre + width)));
  return { low, high };
}

export function formatPotentialRange({ low, high }: { low: number; high: number }): string {
  return low === high ? String(low) : `${low}–${high}`;
}
