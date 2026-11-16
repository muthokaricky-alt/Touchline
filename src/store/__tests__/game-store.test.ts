import { conditionOf, conditionOn, isInjured, NEUTRAL_MORALE } from '@/game/condition/condition';
import { starterIds, validateLineup } from '@/game/lineup';
import { knowledgeOf } from '@/game/scouting/scouting';
import { selectPlayerProfile, selectSquadCandidates } from '@/game/squad/squad-selectors';
import { PLAYING_STYLES } from '@/game/tactics/presets';
import { askingPrice, personalTerms, playerContext } from '@/game/transfers/negotiation';

import { conditionAtKickOff, createInitialGameState, DEFAULT_USER_CLUB_ID, flushSave, suspendedAtKickOff, useGameStore } from '../game-store';

// The autosave's real storage can't run in Jest; use memory (see autosave.test.ts).
jest.mock('@/persistence/storage', () => {
  const { createMemoryStorage } = jest.requireActual('@/persistence/debounced-storage');
  return { platformStorage: createMemoryStorage() };
});
// England only (fast): these tests play many matches, and nothing here is about the world abroad.
// Every part of the game that generates the world uses this (see data/fictional/__fixtures__/domestic.ts).
jest.mock('@/data/fictional', () =>
  jest.requireActual('@/data/fictional/__fixtures__/domestic').domesticFictionalModule(jest.requireActual('@/data/fictional')),
);

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
    // A starter and three squad players: listing several makes a bid by September near-certain
    // without depending on one particular club's needs (values shift as the game evolves).
    const listed = [state().lineup.starters.LST!, ...state().lineup.substitutes.slice(1, 4)];
    listed.forEach((id) => state().toggleTransferListed(id));
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

describe('scouting in the store', () => {
  it('a scout’s report arrives as the calendar moves and narrows what the user sees', () => {
    const target = state().database.contracts.find((c) => c.clubId !== state().userClubId)!.playerId;
    const seen = () => {
      const s = state();
      return selectPlayerProfile(s.database, target, s.currentDate, undefined, s.userClubId, knowledgeOf(s.scouting, s.database, s.userClubId, target))!
        .development.potential;
    };
    const before = seen();
    state().scoutPlayer(target);
    expect(state().scouting.assignments).toHaveLength(1);
    expect(() => state().scoutPlayer(target)).toThrow(/already watching/);

    // Two Saturdays later (more than 14 days after 1 July pre-season): the report is in.
    while (state().scouting.assignments.length) state().playNextFixture();
    expect(knowledgeOf(state().scouting, state().database, state().userClubId, target)).toBe(1);
    expect(state().inbox.some((m) => m.from === 'Chief Scout' && m.category === 'scouting')).toBe(true);
    const width = (range: string) => (range.includes('–') ? Number(range.split('–')[1]) - Number(range.split('–')[0]) : 0);
    expect(width(seen())).toBeLessThanOrEqual(Math.min(2, width(before)));
  });
});

describe('suspensions in the store', () => {
  it('a ban takes the player out of the lineup, is reported, and blocks picking him for that fixture', () => {
    // Play until someone in the squad is banned from the next fixture (deterministic for the fictional world).
    let bannedId: string | undefined;
    for (let i = 0; i < 38 && !bannedId; i++) {
      state().playNextFixture();
      bannedId = candidates().find((c) => suspendedAtKickOff(state()).has(c.player.id))?.player.id;
    }
    expect(bannedId).toBeDefined();
    const selected = () => [...starterIds(state().lineup), ...state().lineup.substitutes];
    expect(selected()).not.toContain(bannedId);
    expect(state().inbox.some((m) => m.title.endsWith('suspended'))).toBe(true);

    state().autoPick();
    expect(selected()).not.toContain(bannedId);

    // Forcing him back in: the store refuses to play the fixture.
    state().assignToSlot(Object.keys(state().lineup.starters)[0], bannedId!);
    expect(() => state().playNextFixture()).toThrow(/suspended/);
  });
});

describe('player condition in the store', () => {
  it('a matchday leaves players tired and keeps injured ones out of the lineup', () => {
    // Play until someone in the squad is injured (deterministic for the fictional world).
    let injuredId: string | undefined;
    for (let i = 0; i < 20 && !injuredId; i++) {
      state().playNextFixture();
      // Injured for the NEXT match (a short knock may heal before then).
      const atKickOff = conditionAtKickOff(state());
      injuredId = candidates().find((c) => isInjured(atKickOff, c.player.id))?.player.id;
    }
    expect(Object.keys(state().condition.players).length).toBeGreaterThan(0);
    expect(injuredId).toBeDefined();
    const selected = [...starterIds(state().lineup), ...state().lineup.substitutes];
    expect(selected).not.toContain(injuredId);
    expect(state().inbox.some((m) => m.category === 'medical')).toBe(true);

    // Auto pick never brings him back.
    state().autoPick();
    expect([...starterIds(state().lineup), ...state().lineup.substitutes]).not.toContain(injuredId);
  });

  it('judges availability at the next kick-off, not today', () => {
    state().playNextFixture(); // 8 Aug; next league match 15 Aug
    const id = state().lineup.starters.LST!;
    const date = state().currentDate;
    const knock = { date, players: { [id]: { fitness: 70, morale: 60, injury: { name: 'dead leg', returns: '2026-08-12' } } } };
    useGameStore.setState({ condition: knock });
    expect(isInjured(conditionOn(knock, date), id)).toBe(true); // hurt today…
    expect(isInjured(conditionAtKickOff(state()), id)).toBe(false); // …fine by kick-off
    expect(conditionOf(conditionAtKickOff(state()), id).fitness).toBe(100);
  });

  it('putting a player on the transfer list hurts his morale', () => {
    const id = state().lineup.substitutes[0];
    state().toggleTransferListed(id);
    expect(conditionOf(state().condition, id).morale).toBe(NEUTRAL_MORALE - 10);
    state().toggleTransferListed(id);
    expect(conditionOf(state().condition, id).morale).toBe(NEUTRAL_MORALE - 5);
  });
});
