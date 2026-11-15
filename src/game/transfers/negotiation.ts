import type { Club, Contract, GameDatabase, Player, PlayerAttributes, PlayerId } from '@/data/schemas';

import { aiSetup } from '../ai/opponent';
import { starterIds } from '../lineup';
import { ageAt, contractYearsLeft, marketValue, playerAbility, roundFee, wageDemand } from './valuation';

/**
 * How AI clubs and players respond in a negotiation. Deterministic rules
 * (no dice): the same bid always gets the same answer, which makes the
 * market learnable and testable.
 *
 *   1. Bid:   club accepts (≥ asking), counters (≥ 70% of asking) or rejects.
 *   2. Terms: player is willing or not (ambition, step down), names a wage
 *             and a maximum length; accepts an offer at ≥ 95% of that wage.
 */

export type PlayerContext = {
  player: Player;
  attributes: PlayerAttributes;
  contract: Contract | null;
  /** Current club, or null for a free agent. */
  club: Club | null;
  ability: number;
  age: number;
  value: number;
  /** In the selling club's best XI (they'll want more for him). */
  isKeyPlayer: boolean;
};

export function playerContext(db: GameDatabase, playerId: PlayerId, date: string): PlayerContext | null {
  const player = db.players.find((p) => p.id === playerId);
  const attributes = db.attributes.find((a) => a.playerId === playerId);
  if (!player || !attributes) return null;
  const contract = db.contracts.find((c) => c.playerId === playerId) ?? null;
  const club = contract ? (db.clubs.find((c) => c.id === contract.clubId) ?? null) : null;
  const ability = playerAbility(player, attributes);
  const age = ageAt(player, date);
  return {
    player,
    attributes,
    contract,
    club,
    ability,
    age,
    value: contract ? marketValue({ ability, age, yearsLeft: contractYearsLeft(contract, date), potential: player.potential }) : 0,
    isKeyPlayer: club ? starterIds(aiSetup(db, club.id).lineup).includes(playerId) : false,
  };
}

/** What the selling club wants: value, plus a premium for a first-team regular. */
export function askingPrice(ctx: PlayerContext): number {
  return roundFee(ctx.value * (ctx.isKeyPlayer ? 1.5 : 1.15));
}

export type BidResponse =
  | { kind: 'accept'; fee: number; message: string }
  | { kind: 'counter'; askingPrice: number; message: string }
  | { kind: 'reject'; message: string };

export function respondToBid(ctx: PlayerContext, bid: number): BidResponse {
  if (!ctx.club) return { kind: 'reject', message: `${ctx.player.lastName} is a free agent: no fee is needed.` };
  const asking = askingPrice(ctx);
  if (bid >= asking) return { kind: 'accept', fee: bid, message: `${ctx.club.name} accept your offer.` };
  if (bid >= asking * 0.7) {
    return {
      kind: 'counter',
      askingPrice: asking,
      message: `${ctx.club.name} want more${ctx.isKeyPlayer ? ' for a first-team regular' : ''}.`,
    };
  }
  return { kind: 'reject', message: `${ctx.club.name} reject the offer: it's well below their valuation.` };
}

export type TermsDemand = { willing: true; weeklyWage: number; maxYears: number } | { willing: false; reason: string };

/** Will the player join `buyer`, and on what terms? */
export function personalTerms(ctx: PlayerContext, buyer: Club): TermsDemand {
  const name = ctx.player.lastName;
  if (ctx.club && buyer.reputation < ctx.club.reputation - 4) {
    return { willing: false, reason: `${name} isn't interested in such a big step down from ${ctx.club.name}.` };
  }
  if (ctx.ability > buyer.reputation + 5) {
    return { willing: false, reason: `${name} has ambitions beyond ${buyer.name}.` };
  }
  return {
    willing: true,
    weeklyWage: wageDemand({ ability: ctx.ability, clubReputation: buyer.reputation, currentWage: ctx.contract?.weeklyWage ?? null }),
    // Older players only get short deals (and want them).
    maxYears: ctx.age >= 33 ? 1 : ctx.age >= 30 ? 2 : 5,
  };
}

export type TermsResponse = { accepted: true } | { accepted: false; reason: string };

export function respondToTerms(demand: TermsDemand, offer: { weeklyWage: number; years: number }): TermsResponse {
  if (!demand.willing) return { accepted: false, reason: demand.reason };
  if (offer.years < 1 || offer.years > demand.maxYears) {
    return { accepted: false, reason: `He'll only sign for up to ${demand.maxYears} year${demand.maxYears === 1 ? '' : 's'}.` };
  }
  if (offer.weeklyWage < demand.weeklyWage * 0.95) {
    return { accepted: false, reason: 'The wage offer is too low.' };
  }
  return { accepted: true };
}
