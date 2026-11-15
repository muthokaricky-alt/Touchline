import { z } from 'zod';

import { ClubIdSchema, IsoDateSchema, PlayerIdSchema, type ClubId, type GameDatabase, type PlayerId } from '@/data/schemas';
import { addDays } from '@/utils/date';
import { formatCompactCurrency, formatDate } from '@/utils/format';
import { createRng } from '@/utils/random';

import { aiSetup } from '../ai/opponent';
import type { NewMessage } from '../inbox/inbox';
import { starterIds } from '../lineup';
import { mixSeed } from '../season/season';
import { effectiveRating } from '../squad/position-fit';
import { fullName } from '../squad/squad-selectors';
import { squadSize, wageBill } from './complete';
import { personalTerms, playerContext } from './negotiation';
import { roundFee, wageDemand } from './valuation';
import { transferWindow } from './window';

/**
 * AI clubs bidding for the USER's players.
 *
 * Each time the calendar moves on (in a window), every listed player has a
 * fair chance of attracting a bid, and first-team players a small chance of
 * an unsolicited one (at a premium). A bidder must need the position (its
 * own starter there is weaker), afford fee and wage, and be a club the
 * player would join. Seeded by date, so the same career replays the same.
 */

export const TransferOfferSchema = z.strictObject({
  id: z.string().regex(/^off_[a-z0-9_]+$/),
  playerId: PlayerIdSchema,
  fromClubId: ClubIdSchema,
  fee: z.int().positive(),
  weeklyWage: z.int().positive(),
  date: IsoDateSchema,
  /** Last day it can be accepted. */
  expires: IsoDateSchema,
  unsolicited: z.boolean(),
});
export type TransferOffer = z.infer<typeof TransferOfferSchema>;

export const LISTED_OFFER_CHANCE = 0.45;
// Per first-team player per calendar move in a window: ~12 such moves a season × 11 starters
// ≈ one premium bid a season. (0.03 gave three in a month in the browser.)
export const UNSOLICITED_OFFER_CHANCE = 0.01;
const OFFER_DAYS = 10;

export type OfferContext = {
  db: GameDatabase;
  userClubId: ClubId;
  listed: readonly PlayerId[];
  /** The user's starting XI (for unsolicited bids). */
  firstTeam: readonly PlayerId[];
  pending: readonly TransferOffer[];
  date: string;
  seed: number;
};

/** AI clubs that would bid for `playerId` (need, money, willingness), strongest first. */
export function interestedClubs(db: GameDatabase, userClubId: ClubId, playerId: PlayerId, fee: number, date: string): ClubId[] {
  const ctx = playerContext(db, playerId, date);
  if (!ctx) return [];
  return db.clubs
    .filter((club) => club.id !== userClubId)
    .filter((club) => {
      if (club.finances.transferBudget < fee) return false;
      const wage = wageDemand({ ability: ctx.ability, clubReputation: club.reputation, currentWage: ctx.contract?.weeklyWage ?? null });
      if (wageBill(db, club.id) + wage > club.finances.weeklyWageBudget) return false;
      if (squadSize(db, club.id) >= 30) return false;
      if (!personalTerms(ctx, club).willing) return false;
      // Need: their current starter in his position is weaker than him (or they have none).
      const setup = aiSetup(db, club.id);
      const starters = new Set(starterIds(setup.lineup));
      const rival = setup.squad.filter((c) => starters.has(c.player.id) && c.player.primaryPosition === ctx.player.primaryPosition);
      const best = Math.max(0, ...rival.map((c) => effectiveRating(c.player, c.attributes, ctx.player.primaryPosition)));
      return best < ctx.ability;
    })
    .sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1))
    .map((c) => c.id);
}

/** New offers for this date (not including ones already pending). */
export function generateOffers({ db, userClubId, listed, firstTeam, pending, date, seed }: OfferContext): TransferOffer[] {
  if (!transferWindow(date).open) return [];
  const rng = createRng(mixSeed(seed, Number(date.replace(/-/g, ''))));
  const hasOffer = new Set(pending.map((o) => o.playerId));
  const own = new Set(db.contracts.filter((c) => c.clubId === userClubId).map((c) => c.playerId));
  const offers: TransferOffer[] = [];

  const consider = (playerId: PlayerId, unsolicited: boolean) => {
    if (!own.has(playerId) || hasOffer.has(playerId)) return;
    if (rng.next() >= (unsolicited ? UNSOLICITED_OFFER_CHANCE : LISTED_OFFER_CHANCE)) return;
    const ctx = playerContext(db, playerId, date);
    if (!ctx || ctx.value <= 0) return;
    // Listed players go for around their value; unprompted bids carry a premium to tempt you.
    const fee = roundFee(ctx.value * (unsolicited ? 1.2 + rng.next() * 0.3 : 0.85 + rng.next() * 0.3));
    const clubs = interestedClubs(db, userClubId, playerId, fee, date);
    if (clubs.length === 0) return;
    const buyerId = rng.pick(clubs.slice(0, 5));
    const buyer = db.clubs.find((c) => c.id === buyerId)!;
    offers.push({
      id: `off_${playerId.replace(/^plr_/, '')}_${date.replace(/-/g, '')}`,
      playerId,
      fromClubId: buyerId,
      fee,
      weeklyWage: wageDemand({ ability: ctx.ability, clubReputation: buyer.reputation, currentWage: ctx.contract?.weeklyWage ?? null }),
      date,
      expires: addDays(date, OFFER_DAYS),
      unsolicited,
    });
    hasOffer.add(playerId);
  };

  for (const id of listed) consider(id, false);
  for (const id of firstTeam) if (!listed.includes(id)) consider(id, true);
  return offers;
}

/** Offers still open on `date` (not expired, window still open, player still yours). */
export function liveOffers(db: GameDatabase, userClubId: ClubId, offers: readonly TransferOffer[], date: string): TransferOffer[] {
  const own = new Set(db.contracts.filter((c) => c.clubId === userClubId).map((c) => c.playerId));
  return offers.filter((o) => o.expires >= date && transferWindow(date).open && own.has(o.playerId));
}

export function offerMessage(db: GameDatabase, offer: TransferOffer): NewMessage {
  const player = db.players.find((p) => p.id === offer.playerId);
  const club = db.clubs.find((c) => c.id === offer.fromClubId);
  const name = player ? fullName(player) : offer.playerId;
  return {
    date: offer.date,
    category: 'offer',
    from: club?.name ?? offer.fromClubId,
    title: `${offer.unsolicited ? 'Unsolicited bid' : 'Offer'} for ${name}: ${formatCompactCurrency(offer.fee)}`,
    body: `${club?.name ?? 'A club'} want to sign ${name}. The offer is open until ${formatDate(offer.expires)}.`,
    offerId: offer.id,
  };
}
