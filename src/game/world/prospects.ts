import { generateYouthIntake } from '@/data/fictional';
import type { Club, NationCode, Player, PlayerAttributes } from '@/data/schemas';
import { createRng } from '@/utils/random';

import { mixSeed } from '../season/season';

/**
 * Youth prospects: every summer each country with clubs produces a handful
 * of 16–17-year-olds who belong to no club. They are the game's wonderkids:
 * most are ordinary, a few have a very high potential, and the user only
 * finds out who they are by sending a scout to the country (see
 * game/scouting/region-scouting.ts).
 *
 * Like club intakes they are REGENERATED, never saved: a pool depends only
 * on (world seed, year, country). They join the world with no contract and
 * stay hidden from the transfer market until scouted. Whoever nobody has
 * signed by the next summer gives up on football (renewal.ts), so a pool
 * lasts one season: scout early, sign before the next one arrives.
 *
 * The first pool is the summer of FIRST_PROSPECT_YEAR (with the first club
 * intake): a career's first season has none.
 */

export const FIRST_PROSPECT_YEAR = 2027;
/** Prospects a country produces each summer. */
export const PROSPECTS_MIN = 4;
export const PROSPECTS_MAX = 7;

/** Id numbers 2,000,000–2,999,999: clear of the base world (≈1–3,200) and of club intakes (100,000+ and 1,000,000+). */
const PROSPECT_ID_BASE = 2_000_000;

/** Id number of the k-th prospect of a country (`nationIndex` is its place in the sorted list of countries). */
export const prospectPlayerNumber = (year: number, nationIndex: number, k: number): number => PROSPECT_ID_BASE + (year - 2000) * 10_000 + nationIndex * 100 + k;

const prospectNumber = (id: string): number => Number(id.slice(4));

/** Is this id one of a country's youth prospects (not a base player or a club's academy graduate)? */
export const isProspectId = (id: string): boolean => {
  const n = prospectNumber(id);
  return n >= PROSPECT_ID_BASE && n < PROSPECT_ID_BASE + 1_000_000;
};

/** The summer a prospect was produced. */
export const prospectYear = (id: string): number => 2000 + Math.floor((prospectNumber(id) - PROSPECT_ID_BASE) / 10_000);

/** Countries that produce prospects: every country with a club, sorted by code. */
export const prospectNations = (clubs: readonly Club[]): NationCode[] => [...new Set(clubs.map((c) => c.country))].sort();

/** Typical academy level of a country's prospects (the stand-in club's reputation). */
const PROSPECT_REPUTATION = 14;

export type ProspectPool = { nation: NationCode; players: Player[]; attributes: PlayerAttributes[] };

const poolCache = new Map<string, ProspectPool[]>();

/**
 * Every country's prospects for the summer of `year`. Deterministic; cached.
 * Potential comes in tiers: about one in eight is a real wonderkid (16–19),
 * a further three in ten are good (13–16), the rest ordinary (9–13).
 */
export function generatedProspects(clubs: readonly Club[], seed: number, year: number): ProspectPool[] {
  const key = `${seed}:${year}:${clubs.length}`;
  const cached = poolCache.get(key);
  if (cached) return cached;
  const date = `${year}-07-01`;
  const pools = prospectNations(clubs).map((nation, nationIndex) => {
    const rng = createRng(mixSeed(seed, 20_000_000 + year * 100 + nationIndex));
    const home = clubs.find((c) => c.country === nation)!;
    const generated = generateYouthIntake({
      rng,
      club: { ...home, reputation: PROSPECT_REPUTATION },
      count: rng.int(PROSPECTS_MIN, PROSPECTS_MAX),
      referenceDate: date,
      playerNumber: (k) => prospectPlayerNumber(year, nationIndex, k),
      // Home-grown only: a country's prospects are all from that country.
      foreignNations: [nation],
    });
    const players = generated.players.map((player) => {
      const roll = rng.next();
      const potential = roll < 0.12 ? rng.int(16, 19) : roll < 0.42 ? rng.int(13, 16) : rng.int(9, 13);
      return { ...player, nationality: nation, potential };
    });
    return { nation, players, attributes: generated.attributes };
  });
  poolCache.set(key, pools);
  return pools;
}
