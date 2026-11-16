import { starterIds } from '@/game/lineup';
import { liveView, snapshotAt } from '@/game/match/live';
import { nextFixtureFor } from '@/game/season/season-flow';

import { createInitialGameState, flushSave, liveContext, useGameStore } from '../game-store';

// The autosave's real storage can't run in Jest; use memory (see autosave.test.ts).
jest.mock('@/persistence/storage', () => {
  const { createMemoryStorage } = jest.requireActual('@/persistence/debounced-storage');
  return { platformStorage: createMemoryStorage() };
});

beforeEach(() => {
  useGameStore.setState(createInitialGameState());
});
afterEach(() => flushSave());

const state = () => useGameStore.getState();
const live = () => liveView(liveContext(state()), state().liveMatch!);

describe('live matches in the store', () => {
  it('kick-off records nothing and locks everything that would change the match', () => {
    const before = state();
    state().kickOff();
    expect(state().liveMatch).toMatchObject({ kind: 'fixture', fixtureId: nextFixtureFor(before.season, before.userClubId)!.id, changes: [] });
    expect(state().season).toBe(before.season);
    expect(state().currentDate).toBe(before.currentDate);

    expect(() => state().autoPick()).toThrow('Finish the match in progress first.');
    expect(() => state().setInstruction('mentality', 'attacking')).toThrow('Finish the match in progress first.');
    expect(() => state().releasePlayer(before.lineup.substitutes[0])).toThrow('Finish the match in progress first.');
    expect(() => state().kickOff()).toThrow('Finish the match in progress first.');
    expect(state().lineup).toBe(before.lineup);
  });

  it('a substitution changes the live match, and full time records exactly what was shown', () => {
    state().kickOff();
    const after = { minute: 55 };
    const snapshot = snapshotAt(live(), after);
    const side = live().side;
    const off = snapshot.teams[side].onPitch.find((p) => p.position !== 'GK')!.id;
    const on = snapshot.teams[side].bench[0];
    state().makeMatchChange(after, { kind: 'substitution', offId: off, onId: on });
    state().makeMatchChange({ minute: 70 }, { kind: 'tactics', tactics: { ...state().tactics, mentality: 'defensive' } });

    const shown = live().result;
    expect(shown.events.some((e) => e.type === 'substitution' && e.reason === 'manager' && e.onId === on)).toBe(true);
    expect(snapshotAt(live(), after).teams[side].onPitch.map((p) => p.id)).toContain(on);

    const fixtureId = state().liveMatch!.kind === 'fixture' ? (state().liveMatch as { fixtureId: string }).fixtureId : '';
    const recorded = state().finishMatch();
    expect(recorded).toEqual(shown);
    expect(state().liveMatch).toBeNull();
    expect(state().lastMatchFixtureId).toBe(fixtureId);
    expect(state().season.fixtures.find((f) => f.id === fixtureId)?.result?.score).toEqual(shown.score);
    // The career is unlocked again.
    expect(() => state().autoPick()).not.toThrow();
  });

  it('refuses impossible changes and changes out of match order', () => {
    state().kickOff();
    const side = live().side;
    const bench = snapshotAt(live(), { minute: 30 }).teams[side].bench;
    const starter = starterIds(state().lineup)[3];
    expect(() => state().makeMatchChange({ minute: 30 }, { kind: 'substitution', offId: bench[0], onId: starter })).toThrow('isn’t on the pitch');
    state().makeMatchChange({ minute: 60 }, { kind: 'tactics', tactics: state().tactics });
    expect(() => state().makeMatchChange({ minute: 50 }, { kind: 'tactics', tactics: state().tactics })).toThrow('match order');
    expect(state().liveMatch?.changes).toHaveLength(1);
  });

  it('a live friendly records nothing in the season', () => {
    const before = state();
    const opponent = before.database.clubs.find((c) => c.id !== before.userClubId)!.id;
    state().kickOffFriendly(opponent, 'home', 42);
    const result = state().finishMatch();
    expect(state().season).toBe(before.season);
    expect(state().lastMatch).toEqual(result);
    expect(state().lastMatchFixtureId).toBeNull();
    expect(state().liveMatch).toBeNull();
  });
});
