import { starterIds, validateLineup } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { PLAYING_STYLES } from '@/game/tactics/presets';
import { askingPrice, personalTerms, playerContext } from '@/game/transfers/negotiation';

import { createInitialGameState, DEFAULT_USER_CLUB_ID, flushSave, useGameStore } from '../game-store';

// The autosave's real storage can't run in Jest; use memory (see autosave.test.ts).
jest.mock('@/persistence/storage', () => {
  const { createMemoryStorage } = jest.requireActual('@/persistence/debounced-storage');
  return { platformStorage: createMemoryStorage() };
});

// The store works without React: getState() reads it, actions update it.
beforeEach(() => {
  useGameStore.setState(createInitialGameState());
});
afterEach(() => flushSave()); // no pending save timer left behind

const state = () => useGameStore.getState();
const candidates = () => selectSquadCandidates(state().database, state().userClubId);

describe('game store', () => {
  it('starts with the default club and a playable auto-picked lineup', () => {
    expect(state().userClubId).toBe(DEFAULT_USER_CLUB_ID);
    expect(starterIds(state().lineup)).toHaveLength(11);
    expect(validateLineup(state().lineup, candidates()).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('changes formation and keeps the same starters', () => {
    const before = starterIds(state().lineup).sort();
    state().changeFormation('4-2-3-1');
    expect(state().lineup.formationId).toBe('4-2-3-1');
    expect(starterIds(state().lineup).sort()).toEqual(before);
  });

  it('assigns, clears and removes players', () => {
    const rb = state().lineup.starters.RB!;
    state().assignToSlot('LB', rb);
    expect(state().lineup.starters.LB).toBe(rb);

    state().clearSlot('LB');
    expect(state().lineup.starters.LB).toBeNull();

    const sub = state().lineup.substitutes[0];
    state().removeFromLineup(sub);
    expect(state().lineup.substitutes).not.toContain(sub);

    state().addSubstitute(sub);
    expect(state().lineup.substitutes).toContain(sub);
  });

  it('auto pick repairs a broken lineup', () => {
    state().clearSlot('GK');
    state().autoPick();
    expect(state().lineup.starters.GK).not.toBeNull();
  });

  it('starts with balanced tactics, applies a style and changes single instructions', () => {
    expect(state().tactics).toEqual(PLAYING_STYLES.balanced.tactics);

    state().applyPlayingStyle('counter');
    expect(state().tactics).toEqual(PLAYING_STYLES.counter.tactics);

    state().setInstruction('width', 'wide');
    expect(state().tactics.width).toBe('wide');
    expect(state().tactics.passing).toBe(PLAYING_STYLES.counter.tactics.passing);
  });

  it('plays a friendly with the current team, stores it, and clears it', () => {
    expect(state().lastMatch).toBeNull();
    const result = state().playFriendly('club_kestrel_bay', 'away', 123);
    expect(state().lastMatch).toBe(result);
    expect(result.away.clubId).toBe(DEFAULT_USER_CLUB_ID);
    expect(result.seed).toBe(123);
    // Same seed and team → same match.
    expect(state().playFriendly('club_kestrel_bay', 'away', 123)).toEqual(result);
    state().clearMatch();
    expect(state().lastMatch).toBeNull();
  });

  it('plays fixtures date by date and moves the calendar on', () => {
    expect(state().season.fixtures.every((f) => f.result === null)).toBe(true);
    const result = state().playNextFixture();
    expect([result.home.clubId, result.away.clubId]).toContain(DEFAULT_USER_CLUB_ID);
    const firstDay = state().season.fixtures.filter((f) => f.date === '2026-08-08');
    expect(firstDay.every((f) => f.result)).toBe(true);
    const mine = firstDay.find((f) => f.homeId === DEFAULT_USER_CLUB_ID || f.awayId === DEFAULT_USER_CLUB_ID)!;
    expect(state().lastMatchFixtureId).toBe(mine.id);
    expect(state().currentDate).toBe('2026-08-08');
    // A friendly afterwards is not a competitive match.
    state().playFriendly('club_kestrel_bay', 'home', 1);
    expect(state().lastMatchFixtureId).toBeNull();
  });

  it('signs a player only on terms the club and player accept', () => {
    const db = state().database;
    const target = db.contracts.find((c) => c.clubId === 'club_westhaven_albion' && c.squadNumber === 31)!.playerId;
    const ctx = playerContext(db, target, state().currentDate)!;
    const terms = personalTerms(ctx, db.clubs.find((c) => c.id === DEFAULT_USER_CLUB_ID)!);
    if (!terms.willing) throw new Error('test player should be willing');
    const fair = { playerId: target, fee: askingPrice(ctx), weeklyWage: terms.weeklyWage, years: 1 };

    expect(() => state().signPlayer({ ...fair, fee: Math.round(fair.fee * 0.5) })).toThrow(/reject/);
    expect(() => state().signPlayer({ ...fair, weeklyWage: Math.round(fair.weeklyWage * 0.5) })).toThrow(/too low/);
    expect(state().database).toBe(db); // nothing changed

    state().signPlayer(fair);
    expect(state().database.contracts.find((c) => c.playerId === target)!.clubId).toBe(DEFAULT_USER_CLUB_ID);
    expect(state().transferHistory.length).toBeGreaterThanOrEqual(1);
  });

  it('runs a season with a listed player, then lets expired contracts go at the rollover', () => {
    const listed = state().lineup.substitutes[0];
    state().toggleTransferListed(listed);
    const expiring = state().database.contracts.filter((c) => c.clubId === DEFAULT_USER_CLUB_ID && c.endDate < '2027-07-01').map((c) => c.playerId);
    while (state().season.fixtures.some((f) => !f.result && (f.homeId === DEFAULT_USER_CLUB_ID || f.awayId === DEFAULT_USER_CLUB_ID))) {
      state().playNextFixture();
    }
    // Late May: no window is open, so every offer has lapsed.
    expect(state().offers).toEqual([]);
    expect(state().inbox.length).toBeGreaterThan(0);
    state().finishSeason();
    state().startNextSeason();

    // The calendar moves to 1 July: next season, summer window open.
    expect(state().currentDate).toBe('2027-07-01');
    const db = state().database;
    expiring.forEach((id) => expect(db.contracts.find((c) => c.playerId === id)?.clubId).not.toBe(DEFAULT_USER_CLUB_ID));
    expect(validateLineup(state().lineup, candidates()).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('accepts an offer for a listed player and refills the lineup', () => {
    const listed = state().lineup.starters.LST!;
    state().toggleTransferListed(listed);
    // Move through the summer until a club bids (offers are seeded, so this is deterministic).
    while (state().offers.length === 0 && state().currentDate < '2026-09-01') state().playNextFixture();
    const offer = state().offers[0];
    expect(offer).toBeDefined(); // deterministic for the fictional world's seed
    state().acceptOffer(offer.id);
    expect(state().database.contracts.find((c) => c.playerId === offer.playerId)!.clubId).toBe(offer.fromClubId);
    expect(starterIds(state().lineup)).not.toContain(offer.playerId);
    expect(validateLineup(state().lineup, candidates()).filter((i) => i.severity === 'error')).toEqual([]);
    expect(() => state().acceptOffer(offer.id)).toThrow(/no longer available/);
  });

  it('marks inbox messages read', () => {
    state().releasePlayer(state().lineup.substitutes[0]);
    expect(state().inbox[0].read).toBe(false);
    state().markMessageRead(state().inbox[0].id);
    expect(state().inbox[0].read).toBe(true);
  });

  it('guards season transitions', () => {
    expect(() => state().startNextSeason()).toThrow(/still in progress/);
    expect(() => state().finishSeason()).toThrow(/still have fixtures/);
  });

  it('replaces the lineup object on change (so React re-renders)', () => {
    const before = state().lineup;
    state().clearSlot('LM');
    expect(state().lineup).not.toBe(before);
  });
});
