import { buildFictionalDatabase } from '@/data/fictional';
import { checkIntegrity } from '@/data/integrity';
import { autoPickLineup, starterIds, validateLineup } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { addDays } from '@/utils/date';

import {
  acceptOffer,
  afterCalendarMove,
  rejectOffer,
  releaseFromSquad,
  renewPlayer,
  seasonRollover,
  toggleListed,
  type TransferCareer,
} from '../career';
import { renewalYears, squadSize } from '../complete';
import { personalTerms, playerContext } from '../negotiation';

const db = buildFictionalDatabase();
const USER = 'club_greywater_town';
const lineup = autoPickLineup(selectSquadCandidates(db, USER), '4-4-2');
const fresh: TransferCareer = { db, userClubId: USER, date: '2026-07-01', lineup, transferListed: [], offers: [], inbox: [], transferHistory: [] };
const own = db.contracts.filter((c) => c.clubId === USER).map((c) => c.playerId);
const starter = lineup.starters.LST!;
const reserve = own.find((id) => !starterIds(lineup).includes(id) && !lineup.substitutes.includes(id))!;

/** Lists `ids` and moves the calendar until at least one offer arrives. */
function careerWithOffer(ids: string[]): TransferCareer {
  let c = ids.reduce((acc, id) => toggleListed(acc, id), fresh);
  for (let d = 1; d <= 60 && c.offers.length === 0; d += 3) {
    const previous = c.date;
    c = afterCalendarMove({ ...c, date: addDays('2026-07-01', d) }, previous, 11);
  }
  return c;
}

describe('transfer list', () => {
  it('toggles your own players only', () => {
    const listed = toggleListed(fresh, reserve);
    expect(listed.transferListed).toEqual([reserve]);
    expect(toggleListed(listed, reserve).transferListed).toEqual([]);
    const other = db.contracts.find((c) => c.clubId !== USER)!.playerId;
    expect(() => toggleListed(fresh, other)).toThrow(/own players/);
  });
});

describe('offers through the calendar', () => {
  const withOffer = careerWithOffer([starter, reserve]);
  const offer = withOffer.offers[0];

  it('arrive with an inbox message linked to them', () => {
    expect(offer).toBeDefined();
    const message = withOffer.inbox.find((m) => m.offerId === offer.id)!;
    expect(message.category).toBe('offer');
    expect(message.read).toBe(false);
  });

  it('accepting sells the player, refills the lineup and records it', () => {
    const after = acceptOffer(withOffer, offer.id);
    expect(after.db.contracts.find((c) => c.playerId === offer.playerId)!.clubId).toBe(offer.fromClubId);
    expect(after.transferListed).not.toContain(offer.playerId);
    expect(after.offers.some((o) => o.playerId === offer.playerId)).toBe(false);
    expect(after.transferHistory.at(-1)).toMatchObject({ playerId: offer.playerId, fromClubId: USER, toClubId: offer.fromClubId });
    expect(after.inbox[0].title).toMatch(/sold to/);
    expect(after.inbox.find((m) => m.offerId === offer.id)!.read).toBe(true);
    expect(validateLineup(after.lineup, selectSquadCandidates(after.db, USER)).filter((i) => i.severity === 'error')).toEqual([]);
    expect(checkIntegrity(after.db)).toEqual([]);
  });

  it('rejecting just removes the offer', () => {
    const after = rejectOffer(withOffer, offer.id);
    expect(after.offers.some((o) => o.id === offer.id)).toBe(false);
    expect(after.db).toBe(withOffer.db);
  });

  it('an expired offer can no longer be accepted', () => {
    expect(() => acceptOffer({ ...withOffer, date: addDays(offer.expires, 1) }, offer.id)).toThrow(/no longer available/);
  });
});

describe('release and renewal', () => {
  it('releasing a starter frees him and refills his slot', () => {
    const after = releaseFromSquad(fresh, starter);
    expect(after.db.contracts.some((c) => c.playerId === starter)).toBe(false);
    expect(after.lineup.starters.LST).not.toBeNull();
    expect(after.lineup.starters.LST).not.toBe(starter);
    expect(after.inbox[0].title).toMatch(/released/);
    expect(squadSize(after.db, USER)).toBe(21);
  });

  it('renews on terms the player accepts, refuses lowballs', () => {
    const ctx = playerContext(db, reserve, fresh.date)!;
    const terms = personalTerms(ctx, db.clubs.find((c) => c.id === USER)!);
    if (!terms.willing) return; // an over-ambitious player may refuse to renew; covered elsewhere
    const years = renewalYears(ctx.contract!, fresh.date, terms.maxYears)[0];
    expect(years).toBeDefined();
    const renewed = renewPlayer(fresh, { playerId: reserve, weeklyWage: terms.weeklyWage, years });
    expect(renewed.db.contracts.find((c) => c.playerId === reserve)!.weeklyWage).toBe(terms.weeklyWage);
    expect(renewed.inbox[0].title).toMatch(/new contract/);
    expect(() => renewPlayer(fresh, { playerId: reserve, weeklyWage: 100, years })).toThrow(/too low/);
  });
});

describe('season rollover', () => {
  it('lets expired contracts go, keeps the lineup playable and tells the user', () => {
    const after = seasonRollover(fresh, '2027-07-01');
    const expired = db.contracts.filter((c) => c.clubId === USER && c.endDate < '2027-07-01').map((c) => c.playerId);
    expired.forEach((id) => expect(after.db.contracts.find((c) => c.playerId === id)?.clubId).not.toBe(USER));
    if (expired.length) expect(after.inbox[0].title).toMatch(/left on free transfers/);
    expect(validateLineup(after.lineup, selectSquadCandidates(after.db, USER)).filter((i) => i.severity === 'error')).toEqual([]);
    expect(checkIntegrity(after.db)).toEqual([]);
    expect(after.date).toBe('2027-07-01');
  });
});
