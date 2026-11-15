import type { ClubId, GameDatabase, PlayerId } from '@/data/schemas';
import { formatCompactCurrency } from '@/utils/format';

import { addMessages, type InboxMessage, type NewMessage } from '../inbox/inbox';
import { removeAndRefill, starterIds, type Lineup } from '../lineup';
import { fullName, selectSquadCandidates } from '../squad/squad-selectors';
import { completeTransfer, MIN_USER_SQUAD, releasePlayer, renewContract, squadSize, type TransferRecord } from './complete';
import { contractWarnings, processExpiries } from './contracts';
import { personalTerms, playerContext, respondToTerms } from './negotiation';
import { generateOffers, liveOffers, offerMessage, type TransferOffer } from './offers';

/**
 * The user's transfer business as pure state transitions, so the store
 * stays a thin wrapper. Each function takes the relevant slice of career
 * state and returns the new slice; nothing is mutated.
 */

export type TransferCareer = {
  db: GameDatabase;
  userClubId: ClubId;
  date: string;
  lineup: Lineup;
  transferListed: PlayerId[];
  offers: TransferOffer[];
  inbox: InboxMessage[];
  transferHistory: TransferRecord[];
};

const nameOf = (db: GameDatabase, id: PlayerId) => {
  const p = db.players.find((x) => x.id === id);
  return p ? fullName(p) : id;
};
const clubName = (db: GameDatabase, id: ClubId | null) => (id ? (db.clubs.find((c) => c.id === id)?.name ?? id) : 'free agency');

/** A player has left the user's club: refill the lineup, unlist him, drop his offers. */
function departed(career: TransferCareer, db: GameDatabase, playerId: PlayerId): TransferCareer {
  return {
    ...career,
    db,
    lineup: removeAndRefill(career.lineup, playerId, selectSquadCandidates(db, career.userClubId)),
    transferListed: career.transferListed.filter((id) => id !== playerId),
    offers: career.offers.filter((o) => o.playerId !== playerId),
  };
}

/** Called whenever the calendar moves on: expire old offers, maybe receive new ones, contract warnings. */
export function afterCalendarMove(career: TransferCareer, previousDate: string, seed: number): TransferCareer {
  const pending = liveOffers(career.db, career.userClubId, career.offers, career.date);
  const fresh = generateOffers({
    db: career.db,
    userClubId: career.userClubId,
    listed: career.transferListed,
    firstTeam: starterIds(career.lineup),
    pending,
    date: career.date,
    seed,
  });
  const messages: NewMessage[] = [...fresh.map((o) => offerMessage(career.db, o)), ...contractWarnings(career.db, career.userClubId, previousDate, career.date)];
  return { ...career, offers: [...pending, ...fresh], inbox: addMessages(career.inbox, messages) };
}

export function toggleListed(career: TransferCareer, playerId: PlayerId): TransferCareer {
  const own = career.db.contracts.some((c) => c.playerId === playerId && c.clubId === career.userClubId);
  if (!own) throw new RangeError("You can only list your own players.");
  const listed = career.transferListed.includes(playerId);
  return {
    ...career,
    transferListed: listed ? career.transferListed.filter((id) => id !== playerId) : [...career.transferListed, playerId],
  };
}

export function acceptOffer(career: TransferCareer, offerId: string): TransferCareer {
  const offer = liveOffers(career.db, career.userClubId, career.offers, career.date).find((o) => o.id === offerId);
  if (!offer) throw new RangeError('That offer is no longer available.');
  if (squadSize(career.db, career.userClubId) <= MIN_USER_SQUAD) throw new RangeError(`You need at least ${MIN_USER_SQUAD} players.`);
  const outcome = completeTransfer(career.db, {
    playerId: offer.playerId,
    buyerId: offer.fromClubId,
    fee: offer.fee,
    weeklyWage: offer.weeklyWage,
    years: 3,
    date: career.date,
    replaceSeller: false,
  });
  const next = departed(career, outcome.db, offer.playerId);
  return {
    ...next,
    transferHistory: [...career.transferHistory, ...outcome.records],
    inbox: addMessages(
      career.inbox.map((m) => (m.offerId === offerId ? { ...m, read: true } : m)),
      [
        {
          date: career.date,
          category: 'transfer',
          from: 'Director of Football',
          title: `${nameOf(career.db, offer.playerId)} sold to ${clubName(career.db, offer.fromClubId)}`,
          body: `Fee ${formatCompactCurrency(offer.fee)}. The money has been added to your balance, half of it to your transfer budget.`,
        },
      ],
    ),
  };
}

export function rejectOffer(career: TransferCareer, offerId: string): TransferCareer {
  return {
    ...career,
    offers: career.offers.filter((o) => o.id !== offerId),
    inbox: career.inbox.map((m) => (m.offerId === offerId ? { ...m, read: true } : m)),
  };
}

export function releaseFromSquad(career: TransferCareer, playerId: PlayerId): TransferCareer {
  const contract = career.db.contracts.find((c) => c.playerId === playerId);
  if (!contract || contract.clubId !== career.userClubId) throw new RangeError("He isn't one of your players.");
  const { db, cost } = releasePlayer(career.db, playerId, career.date);
  // Not a transfer (no destination club), so transfer history is unchanged; the inbox records it.
  const next = departed(career, db, playerId);
  return {
    ...next,
    inbox: addMessages(career.inbox, [
      {
        date: career.date,
        category: 'squad',
        from: 'Director of Football',
        title: `${nameOf(career.db, playerId)} released`,
        body: `His contract was terminated for ${formatCompactCurrency(cost)} in compensation. He is now a free agent.`,
      },
    ]),
  };
}

/** Re-checks the player's terms (he may want a rise, or more ambitious football) before renewing. */
export function renewPlayer(career: TransferCareer, offer: { playerId: PlayerId; weeklyWage: number; years: number }): TransferCareer {
  const ctx = playerContext(career.db, offer.playerId, career.date);
  const club = career.db.clubs.find((c) => c.id === career.userClubId);
  if (!ctx || !club || ctx.club?.id !== career.userClubId) throw new RangeError("He isn't one of your players.");
  const terms = respondToTerms(personalTerms(ctx, club), offer);
  if (!terms.accepted) throw new RangeError(terms.reason);
  return {
    ...career,
    db: renewContract(career.db, offer.playerId, offer.weeklyWage, offer.years, career.date),
    inbox: addMessages(career.inbox, [
      {
        date: career.date,
        category: 'contract',
        from: 'Director of Football',
        title: `${nameOf(career.db, offer.playerId)} signs a new contract`,
        body: `${offer.years} year${offer.years === 1 ? '' : 's'} at ${formatCompactCurrency(offer.weeklyWage)} a week.`,
      },
    ]),
  };
}

/** New season (1 July): contracts expire; the user's leavers go, AI clubs renew/release/refill. */
export function seasonRollover(career: TransferCareer, seasonStart: string): TransferCareer {
  const outcome = processExpiries(career.db, career.userClubId, seasonStart);
  let next: TransferCareer = { ...career, db: outcome.db, date: seasonStart, offers: [] };
  for (const id of outcome.userLeavers) next = departed(next, outcome.db, id);
  const messages: NewMessage[] = outcome.userLeavers.length
    ? [
        {
          date: seasonStart,
          category: 'contract',
          from: 'Director of Football',
          title: `${outcome.userLeavers.length} player${outcome.userLeavers.length === 1 ? '' : 's'} left on free transfers`,
          body: `${outcome.userLeavers.map((id) => nameOf(career.db, id)).join(', ')} reached the end of their contracts.`,
        },
      ]
    : [];
  return { ...next, inbox: addMessages(next.inbox, messages) };
}
