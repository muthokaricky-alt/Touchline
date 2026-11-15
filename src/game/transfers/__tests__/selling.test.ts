import { buildFictionalDatabase } from '@/data/fictional';
import { checkIntegrity } from '@/data/integrity';
import type { GameDatabase } from '@/data/schemas';
import { aiSetup } from '@/game/ai/opponent';
import { autoPickLineup, removeAndRefill, starterIds, validateLineup } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { addDays } from '@/utils/date';

import { completeTransfer, MIN_USER_SQUAD, releaseCost, releasePlayer, renewalYears, renewContract, squadSize, wageBill } from '../complete';
import { contractWarnings, missingPositions, processExpiries } from '../contracts';
import { playerContext } from '../negotiation';
import { generateOffers, interestedClubs, liveOffers, offerMessage, TransferOfferSchema, UNSOLICITED_OFFER_CHANCE, type TransferOffer } from '../offers';

const db = buildFictionalDatabase();
const USER = 'club_greywater_town';
const SUMMER = '2026-07-01';
const own = db.contracts.filter((c) => c.clubId === USER).map((c) => c.playerId);
const lineup = autoPickLineup(selectSquadCandidates(db, USER), '4-4-2');
const firstTeam = starterIds(lineup);
const listed = own.filter((id) => !firstTeam.includes(id)).slice(0, 4);

/** Offers over a run of summer dates (each date is one draw). */
function offersOver(days: number, opts: { listed?: string[]; firstTeam?: string[] } = {}): TransferOffer[] {
  const all: TransferOffer[] = [];
  for (let d = 0; d < days; d += 3) {
    all.push(
      ...generateOffers({ db, userClubId: USER, listed: opts.listed ?? listed, firstTeam: opts.firstTeam ?? [], pending: all, date: addDays(SUMMER, d), seed: 7 }),
    );
  }
  return all;
}

describe('generateOffers', () => {
  const offers = offersOver(40);

  it('produces valid offers for listed players from clubs that want them', () => {
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(TransferOfferSchema.safeParse(o).success).toBe(true);
      expect(listed).toContain(o.playerId);
      expect(o.fromClubId).not.toBe(USER);
      expect(interestedClubs(db, USER, o.playerId, o.fee, o.date)).toContain(o.fromClubId);
    }
  });

  it('prices listed players around their value', () => {
    for (const o of offers) {
      const value = playerContext(db, o.playerId, o.date)!.value;
      expect(o.fee).toBeGreaterThanOrEqual(value * 0.8);
      expect(o.fee).toBeLessThanOrEqual(value * 1.2);
    }
  });

  it('never makes two pending offers for the same player', () => {
    expect(new Set(offers.map((o) => o.playerId)).size).toBe(offers.length);
  });

  it('makes no offers outside a window', () => {
    expect(generateOffers({ db, userClubId: USER, listed, firstTeam: [], pending: [], date: '2026-10-01', seed: 7 })).toEqual([]);
  });

  it('is deterministic for a seed and date', () => {
    expect(offersOver(40)).toEqual(offers);
  });

  it('makes rare, premium unsolicited bids for first-team players', () => {
    // 300 independent draws on summer dates, nothing pending (as after offers expire).
    const dates = Array.from({ length: 300 }, (_, i) => `${2026 + Math.floor(i / 60)}-0${7 + (Math.floor(i / 30) % 2)}-${String((i % 30) + 1).padStart(2, '0')}`);
    const unsolicited = dates.flatMap((date) => generateOffers({ db, userClubId: USER, listed: [], firstTeam, pending: [], date, seed: 7 }));
    const value = (o: TransferOffer) => playerContext(db, o.playerId, o.date)!.value;
    unsolicited.forEach((o) => expect(o.unsolicited).toBe(true));
    unsolicited.forEach((o) => expect(o.fee).toBeGreaterThanOrEqual(value(o) * 1.15));
    // Rate per starter per draw: at most the configured chance (a bidder must also exist), well above zero.
    const rate = unsolicited.length / (dates.length * firstTeam.length);
    expect(rate).toBeLessThanOrEqual(UNSOLICITED_OFFER_CHANCE * 1.5);
    expect(unsolicited.length).toBeGreaterThan(0);
  });

  it('drops offers that expired, after the window, or for players already gone', () => {
    const o = offers[0];
    expect(liveOffers(db, USER, [o], o.date)).toHaveLength(1);
    expect(liveOffers(db, USER, [o], addDays(o.expires, 1))).toHaveLength(0);
    const sold = { ...db, contracts: db.contracts.filter((c) => c.playerId !== o.playerId) };
    expect(liveOffers(sold, USER, [o], o.date)).toHaveLength(0);
  });

  it('writes an inbox message linking the offer', () => {
    const m = offerMessage(db, offers[0]);
    expect(m.category).toBe('offer');
    expect(m.offerId).toBe(offers[0].id);
    expect(m.title).toMatch(/€/);
  });
});

describe('selling to an AI club', () => {
  it('moves the player and money, and never signs a replacement for the user', () => {
    const playerId = listed[0];
    const buyerId = 'club_kestrel_bay';
    const { db: after, records } = completeTransfer(db, { playerId, buyerId, fee: 500_000, weeklyWage: 5000, years: 3, date: SUMMER, replaceSeller: false });
    expect(after.contracts.find((c) => c.playerId === playerId)!.clubId).toBe(buyerId);
    expect(squadSize(after, USER)).toBe(21);
    expect(records).toHaveLength(1);
    expect(after.clubs.find((c) => c.id === USER)!.finances.balance - db.clubs.find((c) => c.id === USER)!.finances.balance).toBe(500_000);
    expect(checkIntegrity(after)).toEqual([]);
  });
});

describe('release and renewal', () => {
  const contract = db.contracts.find((c) => c.playerId === listed[0])!;

  it('releasing costs half the remaining wages and frees the player', () => {
    const cost = releaseCost(contract, SUMMER);
    expect(cost).toBeGreaterThan(0);
    const { db: after, cost: paid } = releasePlayer(db, contract.playerId, SUMMER);
    expect(paid).toBe(cost);
    expect(after.contracts.some((c) => c.playerId === contract.playerId)).toBe(false);
    expect(db.clubs.find((c) => c.id === USER)!.finances.balance - after.clubs.find((c) => c.id === USER)!.finances.balance).toBe(cost);
    expect(releaseCost({ ...contract, endDate: '2026-06-30' }, SUMMER)).toBe(0);
  });

  it(`won't release below ${MIN_USER_SQUAD} players`, () => {
    let d: GameDatabase = db;
    const ids = own.slice(0, own.length - MIN_USER_SQUAD);
    for (const id of ids) d = releasePlayer(d, id, SUMMER).db;
    expect(squadSize(d, USER)).toBe(MIN_USER_SQUAD);
    expect(() => releasePlayer(d, own[own.length - 1], SUMMER)).toThrow(/at least/);
  });

  it('only renews for lengths that extend the current deal', () => {
    const long = { ...contract, endDate: '2029-06-30' };
    expect(renewalYears(long, SUMMER, 5)).toEqual([4, 5]);
    expect(renewalYears(long, SUMMER, 3)).toEqual([]);
    const shortened = { ...db, contracts: db.contracts.map((c) => (c.playerId === contract.playerId ? long : c)) };
    expect(() => renewContract(shortened, contract.playerId, contract.weeklyWage, 2, SUMMER)).toThrow(/beyond his current one/);
  });

  it('renews with new terms, keeping the squad number, within the wage budget', () => {
    const after = renewContract(db, contract.playerId, contract.weeklyWage + 1000, 3, SUMMER);
    const renewed = after.contracts.find((c) => c.playerId === contract.playerId)!;
    expect(renewed).toMatchObject({ weeklyWage: contract.weeklyWage + 1000, endDate: '2029-06-30', squadNumber: contract.squadNumber });
    expect(wageBill(after, USER)).toBe(wageBill(db, USER) + 1000);
    expect(() => renewContract(db, contract.playerId, 10_000_000, 3, SUMMER)).toThrow(/wage budget/);
  });
});

describe('season-end expiries', () => {
  const nextSeason = '2027-07-01';
  const outcome = processExpiries(db, USER, nextSeason);
  const expiring = db.contracts.filter((c) => c.endDate < nextSeason);

  it("lets the user's expired players go", () => {
    const mine = expiring.filter((c) => c.clubId === USER).map((c) => c.playerId);
    expect(outcome.userLeavers.sort()).toEqual(mine.sort());
    // They're no longer ours (AI clubs may already have picked some up as free agents).
    mine.forEach((id) => expect(outcome.db.contracts.find((c) => c.playerId === id)?.clubId).not.toBe(USER));
  });

  it('renews AI key or young players, releases the rest, and refills squads to 22', () => {
    expect(outcome.aiRenewed + outcome.aiReleased).toBe(expiring.filter((c) => c.clubId !== USER).length);
    expect(outcome.aiReleased).toBeGreaterThan(0);
    for (const club of db.clubs) {
      if (club.id === USER) continue;
      expect(squadSize(outcome.db, club.id)).toBeGreaterThanOrEqual(Math.min(22, squadSize(db, club.id)));
    }
    // A renewed AI regular now has a contract running past the new season start.
    const key = expiring.find((c) => c.clubId !== USER && starterIds(aiSetup(db, c.clubId).lineup).includes(c.playerId));
    if (key) expect(outcome.db.contracts.find((c) => c.playerId === key.playerId)!.endDate > nextSeason).toBe(true);
    expect(checkIntegrity(outcome.db)).toEqual([]);
  });

  it('finds the positions a club is short of', () => {
    expect(missingPositions(db, 'club_kestrel_bay')).toEqual([]);
    const gk = db.contracts.find((c) => c.clubId === 'club_kestrel_bay' && c.squadNumber === 1)!.playerId;
    expect(missingPositions({ ...db, contracts: db.contracts.filter((c) => c.playerId !== gk) }, 'club_kestrel_bay')).toEqual(['GK']);
  });
});

describe('contract warnings', () => {
  it('warn when crossing 1 January and 1 April about deals ending that June', () => {
    const endsJune27 = db.contracts.filter((c) => c.clubId === USER && c.endDate === '2027-06-30');
    const jan = contractWarnings(db, USER, '2026-12-26', '2027-01-02');
    const nothing = contractWarnings(db, USER, '2027-01-02', '2027-01-09');
    expect(nothing).toEqual([]);
    if (endsJune27.length) {
      expect(jan).toHaveLength(1);
      expect(jan[0].body).toMatch(/free transfer/);
      expect(contractWarnings(db, USER, '2027-03-27', '2027-04-03')).toHaveLength(1);
    } else {
      expect(jan).toEqual([]);
    }
  });
});

describe('removeAndRefill', () => {
  const squad = selectSquadCandidates(db, USER);

  it('fills a starter’s slot and keeps the bench full', () => {
    const leaving = lineup.starters.LST!;
    const after = removeAndRefill(lineup, leaving, squad.filter((c) => c.player.id !== leaving));
    expect(Object.values(after.starters)).not.toContain(leaving);
    expect(after.starters.LST).not.toBeNull();
    expect(after.substitutes).toHaveLength(lineup.substitutes.length);
    const remaining = squad.filter((c) => c.player.id !== leaving);
    expect(validateLineup(after, remaining).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('replaces a substitute from the reserves', () => {
    const leaving = lineup.substitutes[2];
    const after = removeAndRefill(lineup, leaving, squad.filter((c) => c.player.id !== leaving));
    expect(after.substitutes).not.toContain(leaving);
    expect(after.substitutes).toHaveLength(lineup.substitutes.length);
    expect(after.starters).toEqual(lineup.starters);
  });
});
