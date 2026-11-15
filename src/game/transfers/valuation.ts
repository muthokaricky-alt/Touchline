import type { Contract, Player, PlayerAttributes } from '@/data/schemas';
import { ageOn, parseIsoDate } from '@/utils/date';

import { positionRating } from '../ratings';

/**
 * What players are worth and what they earn. Pure game-design formulas,
 * tested for sensible shapes (better / younger / longer contract → worth more).
 *
 * Calibration targets (agreed in the M7 plan):
 *   ability 16, age 25, 3+ years left  ≈ €25–35M
 *   ability 10, age 31                 ≈ €0.3–0.6M
 */

/** A player's ability: their 1–20 rating in their main position (unrounded). */
export function playerAbility(player: Pick<Player, 'primaryPosition'>, attributes: PlayerAttributes): number {
  return positionRating(attributes, player.primaryPosition);
}

/** Whole and part years until the contract ends (0 if expired). */
export function contractYearsLeft(contract: Pick<Contract, 'endDate'>, onDate: string): number {
  const end = parseIsoDate(contract.endDate);
  const now = parseIsoDate(onDate);
  const months = (end.year - now.year) * 12 + (end.month - now.month) + (end.day - now.day) / 30;
  return Math.max(0, months / 12);
}

/**
 * Peak value at 22–28; cheaper every year after (a small youth premium on
 * top of potential, which marketValue prices separately). Keeps falling into the late 30s: a flat tail made a 35-year-old cost
 * the same as a 34-year-old (caught by a test).
 */
export function ageFactor(age: number): number {
  if (age <= 21) return 1.1;
  if (age <= 28) return 1;
  const late = [0.85, 0.7, 0.55, 0.42, 0.3, 0.2]; // 29..34
  // Beyond 34: -40% a year. (roundFee's €25K minimum is the real floor.)
  return late[age - 29] ?? 0.2 * 0.6 ** (age - 34);
}

/** A player with little left on their deal can be bought cheaply (or leaves for free). */
export function contractFactor(yearsLeft: number): number {
  if (yearsLeft >= 3) return 1;
  if (yearsLeft >= 2) return 0.85;
  if (yearsLeft >= 1) return 0.65;
  return 0.45;
}

/** Rounds money to a "transfer-like" figure: 2 significant digits, at least €25K steps. */
export function roundFee(amount: number): number {
  if (amount <= 0) return 0;
  const magnitude = 10 ** Math.max(4, Math.floor(Math.log10(amount)) - 1);
  return Math.max(25_000, Math.round(amount / magnitude) * magnitude);
}

/** Share of a young player's headroom (potential − ability) that the market already pays for. */
export function potentialWeight(age: number): number {
  if (age <= 19) return 0.6;
  if (age <= 21) return 0.45;
  if (age <= 23) return 0.25;
  return 0;
}

/**
 * Market value. Exponential in ability: each rating point is worth ~77% more
 * (e^0.57), so the jump from good to elite costs far more than from poor to
 * decent, as in real football. Young players are priced partly on what they
 * can become (`potential`, Milestone 8b).
 */
export function marketValue({ ability, age, yearsLeft, potential }: { ability: number; age: number; yearsLeft: number | null; potential?: number }): number {
  const priced = ability + Math.max(0, (potential ?? ability) - ability) * potentialWeight(age);
  const base = 100_000 * Math.exp(0.57 * (priced - 6));
  const contract = yearsLeft === null ? 1 : contractFactor(yearsLeft);
  return roundFee(base * ageFactor(age) * contract);
}

/**
 * Weekly wage a player expects at a club of `clubReputation`: the same shape
 * the squad generator pays (45·ability² + 250·reputation), so new contracts
 * match existing ones. Players moving clubs want at least a 10% rise.
 */
export function wageDemand({ ability, clubReputation, currentWage }: { ability: number; clubReputation: number; currentWage: number | null }): number {
  const base = 45 * ability * ability + 250 * clubReputation;
  const wanted = currentWage ? Math.max(base, currentWage * 1.1) : base;
  return Math.round(wanted / 100) * 100;
}

/** Age (whole years) helper so callers don't need date maths. */
export const ageAt = (player: Pick<Player, 'dateOfBirth'>, date: string) => ageOn(player.dateOfBirth, date);
