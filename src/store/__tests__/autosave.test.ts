import type { createMemoryStorage } from '@/persistence/debounced-storage';
import { SAVE_KEY, SAVE_VERSION } from '@/persistence/save';
import { useSaveStatus } from '@/persistence/save-status';
import { platformStorage } from '@/persistence/storage';

import { createInitialGameState, flushSave, useGameStore } from '../game-store';

/*
 * The real platform storage (expo-sqlite / localStorage) can't run in Jest,
 * so it's replaced by an in-memory one.
 *
 * `jest.mock` is hoisted above the imports, so its factory runs before any
 * variable in this file exists. That's why the memory storage is created
 * INSIDE the factory and then read back through the (mocked) import above.
 */
jest.mock('@/persistence/storage', () => {
  const { createMemoryStorage } = jest.requireActual('@/persistence/debounced-storage');
  return { platformStorage: createMemoryStorage() };
});
const memory = platformStorage as ReturnType<typeof createMemoryStorage>;

const state = () => useGameStore.getState();
const saved = () => JSON.parse(memory.getItem(SAVE_KEY) as string);

/**
 * Simulates closing and reopening the app with `file` on disk: the store
 * starts as a new game, then loads. Resetting the store is itself a change
 * that persist would save, so that write is flushed first and the file is
 * put back afterwards, exactly what's on disk at a real startup.
 */
async function restartWith(file: string | null) {
  useGameStore.setState(createInitialGameState(state().database));
  flushSave();
  if (file === null) memory.removeItem(SAVE_KEY);
  else memory.setItem(SAVE_KEY, file);
  await useGameStore.persist.rehydrate();
}

beforeEach(() => {
  memory.removeItem(SAVE_KEY);
  useSaveStatus.setState({ lastSavedAt: null, notice: null, loadedFromSave: false });
  useGameStore.setState(createInitialGameState(state().database));
  flushSave();
});

describe('autosave', () => {
  it('saves only the career, not the database or the match being replayed', () => {
    state().playNextFixture();
    flushSave();
    const { state: s, version } = saved();
    expect(version).toBe(SAVE_VERSION);
    expect(Object.keys(s).sort()).toEqual(['currentDate', 'lineup', 'season', 'tactics', 'userClubId', 'worldSeed']);
    expect(useSaveStatus.getState().lastSavedAt).not.toBeNull();
  });

  it('round-trips: a played matchday and changed tactics survive a reload', async () => {
    state().applyPlayingStyle('counter');
    state().playNextFixture();
    flushSave();
    const before = { season: state().season, tactics: state().tactics, lineup: state().lineup, currentDate: state().currentDate };

    await restartWith(memory.getItem(SAVE_KEY) as string);

    expect({ season: state().season, tactics: state().tactics, lineup: state().lineup, currentDate: state().currentDate }).toEqual(before);
    expect(state().lastMatch).toBeNull();
    expect(useSaveStatus.getState().loadedFromSave).toBe(true);
    expect(useSaveStatus.getState().notice).toBeNull();
  });

  it('falls back to a new game with a notice when the save is tampered with', async () => {
    state().playNextFixture();
    flushSave();
    const tampered = saved();
    tampered.state.userClubId = 'club_nowhere';

    await restartWith(JSON.stringify(tampered));
    expect(state().season.fixtures.every((f) => f.result === null)).toBe(true);
    expect(useSaveStatus.getState().notice).toMatch(/no longer exists.*new game/);
  });

  it('rejects a save from another format version', async () => {
    await restartWith(JSON.stringify({ state: { anything: true }, version: SAVE_VERSION + 99 }));
    expect(useSaveStatus.getState().notice).toMatch(/older version/);
  });

  it('survives unreadable JSON', async () => {
    await expect(restartWith('{ this is not json')).resolves.not.toThrow();
    expect(useSaveStatus.getState().notice).toMatch(/could not be read/);
    expect(state().season).toBeDefined();
  });

  it('starts a new game silently when there is no save yet', async () => {
    await restartWith(null);
    expect(useSaveStatus.getState().notice).toBeNull();
    expect(useSaveStatus.getState().loadedFromSave).toBe(false);
  });

  it('starts a new game on request and overwrites the save', () => {
    state().playNextFixture();
    flushSave();
    state().startNewGame();
    flushSave();
    expect(saved().state.season.fixtures.every((f: { result: unknown }) => f.result === null)).toBe(true);
    expect(state().currentDate).toBe('2026-07-01');
  });
});
