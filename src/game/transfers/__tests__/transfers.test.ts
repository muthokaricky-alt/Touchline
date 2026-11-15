import { buildFictionalDatabase } from '@/data/fictional';
import { checkIntegrity } from '@/data/integrity';
import { GameDatabaseSchema, type GameDatabase } from '@/data/schemas';
import { aiSetup } from '@/game/ai/opponent';
import { starterIds } from '@/game/lineup';
import { createSeason } from '@/game/season/season-flow';

import { completeTransfer, contractEnd, MAX_SQUAD, squadSize, transferProblems, wageBill } from '../complete';
import { DEFAULT_FILTERS, searchMarket } from '../market';
import { askingPrice, personalTerms, playerContext, respondToBid, respondToTerms } from '../negotiation';

const db = buildFictionalDatabase();
const USER = 'club_greywater_town';
const SUMMER = '2026-07-01';
const AUTUMN = '2026-10-10';
const club = (id: string) => db.clubs.find((c) => c.id === id)!;
const contractOf = (d: GameDatabase, playerId: string) => d.contracts.find((c) => c.playerId === playerId);

/** A first-team player and a reserve at a modest club (affordable for the user). */
const seller = 'club_westhaven_albion';
const starters = starterIds(aiSetup(db, seller).lineup);
const keyPlayer = starters[5];
const reserve = db.contracts.find((c) => c.clubId === seller && !starters.includes(c.playerId))!.playerId;
const freeAgent = db.players.find((p) => !db.contracts.some((c) => c.playerId === p.id))!.id;

describe('respondToBid', () => {
  const key = playerContext(db, keyPlayer, SUMMER)!;
  const spare = playerContext(db, reserve, SUMMER)!;

  it('asks more for a first-team regular', () => {
    expect(key.isKeyPlayer).toBe(true);
    expect(spare.isKeyPlayer).toBe(false);
    expect(askingPrice(key) / key.value).toBeGreaterThan(askingPrice(spare) / spare.value);
  });

  it('accepts at the asking price, counters close to it, rejects far below', () => {
    const asking = askingPrice(key);
    expect(respondToBid(key, asking).kind).toBe('accept');
    expect(respondToBid(key, Math.round(asking * 0.8))).toMatchObject({ kind: 'counter', askingPrice: asking });
    expect(respondToBid(key, Math.round(asking * 0.5)).kind).toBe('reject');
  });

  it('never takes a fee for a free agent', () => {
    expect(respondToBid(playerContext(db, freeAgent, SUMMER)!, 1_000_000).kind).toBe('reject');
  });
});

describe('personal terms', () => {
  const ctx = playerContext(db, reserve, SUMMER)!;
  const demand = personalTerms(ctx, club(USER));

  it('names a wage and length, and accepts an offer that meets them', () => {
    expect(demand.willing).toBe(true);
    if (!demand.willing) return;
    expect(respondToTerms(demand, { weeklyWage: demand.weeklyWage, years: demand.maxYears }).accepted).toBe(true);
    expect(respondToTerms(demand, { weeklyWage: Math.round(demand.weeklyWage * 0.95), years: 1 }).accepted).toBe(true);
    expect(respondToTerms(demand, { weeklyWage: Math.round(demand.weeklyWage * 0.8), years: 1 }).accepted).toBe(false);
    expect(respondToTerms(demand, { weeklyWage: demand.weeklyWage, years: demand.maxYears + 1 }).accepted).toBe(false);
  });

  it('offers older players shorter deals', () => {
    const ages = db.players.map((p) => playerContext(db, p.id, SUMMER)!).filter((c) => c.club);
    const veteran = ages.find((c) => c.age >= 33 && personalTerms(c, club(USER)).willing);
    const young = ages.find((c) => c.age <= 25 && personalTerms(c, club(USER)).willing);
    expect(veteran && personalTerms(veteran, club(USER))).toMatchObject({ maxYears: 1 });
    expect(young && personalTerms(young, club(USER))).toMatchObject({ maxYears: 5 });
  });

  it('refuses a big step down and ambitions beyond the club', () => {
    const star = db.contracts.find((c) => c.clubId === 'club_ravensmoor_united')!.playerId; // reputation 17
    expect(personalTerms(playerContext(db, star, SUMMER)!, club('club_glenvale_athletic')).willing).toBe(false); // reputation 4
  });
});

describe('completeTransfer', () => {
  const ctx = playerContext(db, reserve, SUMMER)!;
  const fee = askingPrice(ctx);
  const wage = 3000;
  const { db: after, records } = completeTransfer(db, { playerId: reserve, buyerId: USER, fee, weeklyWage: wage, years: 3, date: SUMMER });

  it('moves the player, with a new contract and squad number', () => {
    const contract = contractOf(after, reserve)!;
    expect(contract.clubId).toBe(USER);
    expect(contract.weeklyWage).toBe(wage);
    expect(contract.endDate).toBe('2029-06-30');
    const numbers = after.contracts.filter((c) => c.clubId === USER).map((c) => c.squadNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('moves the money', () => {
    expect(club(USER).finances.transferBudget - after.clubs.find((c) => c.id === USER)!.finances.transferBudget).toBe(fee);
    expect(after.clubs.find((c) => c.id === seller)!.finances.balance - club(seller).finances.balance).toBe(fee);
  });

  it('lets the selling club sign a free-agent replacement', () => {
    expect(squadSize(after, seller)).toBe(22);
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({ fromClubId: null, toClubId: seller, fee: 0 });
    const replacement = after.players.find((p) => p.id === records[1].playerId)!;
    const departed = db.players.find((p) => p.id === reserve)!;
    expect(replacement.primaryPosition).toBe(departed.primaryPosition);
  });

  it('leaves a valid, consistent database (and a new object)', () => {
    expect(after).not.toBe(db);
    expect(GameDatabaseSchema.safeParse(after).success).toBe(true);
    expect(checkIntegrity(after)).toEqual([]);
    expect(aiSetup(after, seller)).not.toBe(aiSetup(db, seller)); // cache refreshed for the new world
  });

  it('shows up in the market search under its new club', () => {
    const season = createSeason(after, 2026, 1);
    expect(searchMarket(after, season, USER, DEFAULT_FILTERS, SUMMER, 2000).some((p) => p.id === reserve)).toBe(false);
  });
});

describe('transferProblems', () => {
  const base = { playerId: reserve, buyerId: USER, fee: 100_000, weeklyWage: 3000, years: 2, date: SUMMER };

  it('blocks club-to-club deals outside a window, but not free agents', () => {
    expect(transferProblems(db, { ...base, date: AUTUMN }).join()).toMatch(/window is closed \(it opens on 1 Jan 2027\)/);
    expect(transferProblems(db, { ...base, playerId: freeAgent, fee: 0, date: AUTUMN })).toEqual([]);
  });

  it('enforces budgets, contract length and squad size', () => {
    expect(transferProblems(db, { ...base, fee: 999_000_000 }).join()).toMatch(/transfer budget/);
    expect(transferProblems(db, { ...base, weeklyWage: 999_000 }).join()).toMatch(/wage budget/);
    expect(transferProblems(db, { ...base, years: 6 }).join()).toMatch(/1–5 years/);
    expect(transferProblems(db, { ...base, playerId: db.contracts.find((c) => c.clubId === USER)!.playerId }).join()).toMatch(/already plays/);
    const full = { ...db, contracts: [...db.contracts, ...Array.from({ length: MAX_SQUAD - 22 }, (_, i) => ({ ...db.contracts.find((c) => c.clubId === USER)!, id: `con_fake_${i}`, playerId: `plr_fake_${i}` }))] };
    expect(transferProblems(full, base).join()).toMatch(/squad is full/);
  });

  it('rejects a fee for a free agent', () => {
    expect(transferProblems(db, { ...base, playerId: freeAgent, fee: 10 }).join()).toMatch(/without a fee/);
  });

  it('refuses to complete a deal with problems', () => {
    expect(() => completeTransfer(db, { ...base, date: AUTUMN })).toThrow(RangeError);
  });

  it('measures the wage bill from contracts', () => {
    expect(wageBill(db, USER)).toBe(db.contracts.filter((c) => c.clubId === USER).reduce((s, c) => s + c.weeklyWage, 0));
  });
});

describe('contractEnd', () => {
  it('ends on 30 June of the right season', () => {
    expect(contractEnd('2026-07-01', 3)).toBe('2029-06-30');
    expect(contractEnd('2027-01-20', 2)).toBe('2028-06-30');
  });
});

describe('searchMarket', () => {
  const season = createSeason(db, 2026, 1);

  it("never lists the user's own players and ranks by ability", () => {
    const results = searchMarket(db, season, USER, DEFAULT_FILTERS, SUMMER);
    expect(results.length).toBe(50);
    const own = new Set(db.contracts.filter((c) => c.clubId === USER).map((c) => c.playerId));
    results.forEach((r) => expect(own.has(r.id)).toBe(false));
    const ratings = results.map((r) => r.rating);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  it('filters by position line, scope, age and value', () => {
    const keepers = searchMarket(db, season, USER, { ...DEFAULT_FILTERS, group: 'goalkeepers' }, SUMMER);
    expect(keepers.every((p) => p.position === 'GK')).toBe(true);
    const free = searchMarket(db, season, USER, { ...DEFAULT_FILTERS, scope: 'free' }, SUMMER);
    expect(free.every((p) => p.clubName === null && p.value === 0)).toBe(true);
    const young = searchMarket(db, season, USER, { ...DEFAULT_FILTERS, maxAge: 21 }, SUMMER);
    expect(young.every((p) => p.age <= 21)).toBe(true);
    const cheap = searchMarket(db, season, USER, { ...DEFAULT_FILTERS, maxValue: 1_000_000 }, SUMMER);
    expect(cheap.every((p) => p.value <= 1_000_000)).toBe(true);
    const second = searchMarket(db, season, USER, { ...DEFAULT_FILTERS, scope: 'second' }, SUMMER, 2000);
    const secondClubs = new Set(season.leagues[1].clubIds.map((id) => club(id).name));
    expect(second.every((p) => p.clubName !== null && secondClubs.has(p.clubName))).toBe(true);
  });
});
