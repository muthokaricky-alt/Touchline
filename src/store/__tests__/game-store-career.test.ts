import { seasonEnd } from '@/game/career/career-flow';
import { getFormation } from '@/game/formations';
import { validateLineup } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';

import { createInitialGameState, DEFAULT_USER_CLUB_ID, flushSave, useGameStore } from '../game-store';

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

describe('development in the store', () => {
  it('a new month develops players and sends the coaching report', () => {
    state().setTraining({ intensity: 'heavy' });
    const before = state().database.attributes;
    while (state().currentDate < '2026-09-01') state().playNextFixture();
    expect(state().database.attributes).not.toBe(before);
    expect(state().inbox.some((m) => m.from === 'Head of Coaching' && m.title === 'Development report: September')).toBe(true);
    expect(state().training).toEqual({ focus: 'balanced', intensity: 'heavy' });
  });

  it('every player has a potential in the live world', () => {
    expect(state().database.players.every((p) => p.potential !== undefined)).toBe(true);
  });
});

describe('manager career', () => {
  const OTHER = 'club_kestrel_bay';

  it('a new game has no manager until a career starts at the chosen club', () => {
    expect(state().manager).toBeNull();
    state().startCareer('  Alex Kamau ', OTHER);
    expect(state().userClubId).toBe(OTHER);
    expect(state().manager).toMatchObject({ name: 'Alex Kamau', confidence: 60, sackedOffers: null, history: [] });
    expect(validateLineup(state().lineup, candidates()).filter((i) => i.severity === 'error')).toEqual([]);
    expect(() => state().startCareer('', OTHER)).toThrow(/name/);
    expect(() => state().startCareer('Alex', 'club_nowhere')).toThrow(/Unknown club/);
  });

  it('Rick Kyalo joins the club chosen for a new career and starts', () => {
    state().startCareer('Alex', OTHER);
    const contract = state().database.contracts.find((c) => c.playerId === 'plr_9000');
    expect(contract).toMatchObject({ clubId: OTHER, endDate: '2031-06-30' });
    // Up front, not spent on a hard-to-fill slot out of position (auto pick's improvement pass).
    const slot = Object.entries(state().lineup.starters).find(([, id]) => id === 'plr_9000')?.[0];
    const position = getFormation(state().lineup.formationId).slots.find((x) => x.id === slot)?.position;
    expect(position).toBe('ST');
    expect(state().inbox[0].title).toBe('Rick Kyalo joins Kestrel Bay');
    // Before a career he's a free agent; the board's wage budget grew by his wage.
    const before = createInitialGameState();
    expect(before.database.contracts.some((c) => c.playerId === 'plr_9000')).toBe(false);
    const budget = (db: typeof before.database) => db.clubs.find((c) => c.id === OTHER)!.finances.weeklyWageBudget;
    expect(budget(state().database) - budget(before.database)).toBe(contract!.weeklyWage);
  });

  it('a board that has lost confidence sacks him; he must choose a new club before playing on', () => {
    state().startCareer('Alex', OTHER);
    for (let i = 0; i < 9; i++) state().playNextFixture(); // past the grace period
    useGameStore.setState({ manager: { ...state().manager!, confidence: 1, warned: true } });
    state().playNextFixture();
    // From 1, even a win adds only ~7: still below the threshold of 15, so the sack is certain.
    const offers = state().manager!.sackedOffers!;
    expect(offers.length).toBeGreaterThanOrEqual(1);
    expect(state().inbox.some((m) => /sacked/.test(m.title))).toBe(true);
    expect(() => state().playNextFixture()).toThrow(/Choose your next club/);
    expect(() => state().chooseNewJob(OTHER)).toThrow(/offered/);

    state().chooseNewJob(offers[0]);
    expect(state().userClubId).toBe(offers[0]);
    expect(state().manager).toMatchObject({ sackedOffers: null, confidence: 60 });
    expect(state().transferListed).toEqual([]);
    expect(validateLineup(state().lineup, candidates()).filter((i) => i.severity === 'error')).toEqual([]);
    state().playNextFixture(); // play goes on with the new club
  });

  it('at season end he can accept a job offer and starts next season at the new club', () => {
    state().startCareer('Alex', DEFAULT_USER_CLUB_ID);
    while (state().season.fixtures.some((f) => !f.result && (f.homeId === DEFAULT_USER_CLUB_ID || f.awayId === DEFAULT_USER_CLUB_ID))) {
      state().playNextFixture();
      if (state().manager!.sackedOffers) state().chooseNewJob(state().manager!.sackedOffers![0]);
    }
    state().finishSeason();
    const end = seasonEnd(state().database, state().season, state().userClubId, state().manager!)!;
    const before = state().userClubId;
    if (end.offers.length === 0) {
      state().startNextSeason();
      expect(state().userClubId).toBe(before);
      expect(state().manager!.history.at(-1)).toMatchObject({ clubId: before, outcome: 'completed' });
      return;
    }
    state().startNextSeason(end.offers[0]);
    expect(state().userClubId).toBe(end.offers[0]);
    expect(state().manager!.history.at(-1)).toMatchObject({ clubId: before, outcome: end.review.sacked ? 'sacked' : 'left' });
    expect(state().season.startYear).toBe(2027);
    expect(validateLineup(state().lineup, candidates()).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

