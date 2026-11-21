import type { createMemoryStorage } from '@/persistence/debounced-storage';
import { SAVE_VERSION } from '@/persistence/save';
import { backupKey, slotKey } from '@/persistence/slot-storage';
import { useSaveStatus } from '@/persistence/save-status';
import { platformStorage } from '@/persistence/storage';

import { askingPrice, personalTerms, playerContext } from '@/game/transfers/negotiation';

import { createInitialGameState, flushSave, slotStorage, useGameStore } from '../game-store';

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
// England only (fast): these tests play many matches, and nothing here is about the world abroad.
// Every part of the game that generates the world uses this (see data/fictional/__fixtures__/domestic.ts).
jest.mock('@/data/fictional', () =>
  jest.requireActual('@/data/fictional/__fixtures__/domestic').domesticFictionalModule(jest.requireActual('@/data/fictional')),
);
const memory = platformStorage as ReturnType<typeof createMemoryStorage>;

const state = () => useGameStore.getState();
/** The save in slot 1 (the default slot), as persist wrote it: `{ state, version }`. */
const SLOT = slotKey(1);
const savedFile = () => slotStorage.getItem(SLOT) as string;
const saved = () => JSON.parse(savedFile());

/**
 * Simulates closing and reopening the app with `file` on disk: the store
 * starts as a new game, then loads. Resetting the store is itself a change
 * that persist would save, so that write is flushed first and the file is
 * put back afterwards, exactly what's on disk at a real startup.
 */
async function restartWith(file: string | null) {
  useGameStore.setState(createInitialGameState(state().database));
  flushSave();
  // The file goes in as written by hand (uncompressed saves are still readable), without a backup.
  memory.removeItem(backupKey(SLOT));
  if (file === null) memory.removeItem(SLOT);
  else memory.setItem(SLOT, file);
  await useGameStore.persist.rehydrate();
}

beforeEach(() => {
  memory.removeItem(SLOT);
  memory.removeItem(backupKey(SLOT));
  useSaveStatus.setState({ lastSavedAt: null, notice: null, loadedFromSave: false });
  useGameStore.setState(createInitialGameState(state().database));
  flushSave();
});

describe('autosave', () => {
  it('keeps Rick Kyalo at the career club after a restart', async () => {
    state().startCareer('Alex', 'club_kestrel_bay');
    flushSave();
    await restartWith(savedFile());
    expect(state().database.contracts.find((c) => c.playerId === 'plr_9000')?.clubId).toBe('club_kestrel_bay');
    expect(Object.values(state().lineup.starters)).toContain('plr_9000');
  });

  it('resumes a match in progress after a restart, with its changes', async () => {
    state().kickOff();
    state().makeMatchChange({ minute: 60 }, { kind: 'tactics', tactics: { ...state().tactics, mentality: 'attacking' } });
    const live = state().liveMatch;
    flushSave();
    await restartWith(savedFile());
    expect(state().liveMatch).toEqual(live);
    // Finishing it after the restart records the match with the change in it.
    const result = state().finishMatch();
    expect(result.events.some((e) => e.type === 'tactics')).toBe(true);
    expect(state().liveMatch).toBeNull();
  });

  it('saves the career and world changes, not players/attributes or the match being replayed', () => {
    state().playNextFixture();
    flushSave();
    const { state: s, version } = saved();
    expect(version).toBe(SAVE_VERSION);
    expect(Object.keys(s).sort()).toEqual([
      'attributeChanges', 'clubFinances', 'condition', 'contracts', 'currentDate', 'inbox', 'lineup', 'liveMatch', 'manager', 'offers', 'positionChanges', 'retired', 'retraining', 'scouting', 'season',
      'tactics', 'training', 'transferHistory', 'transferListed', 'userClubId', 'worldSeed',
    ]);
    expect(useSaveStatus.getState().lastSavedAt).not.toBeNull();
  });

  it('keeps a signing after a reload', async () => {
    const reserve = state().database.contracts.find((c) => c.clubId === 'club_westhaven_albion' && c.squadNumber === 31)!.playerId;
    const ctx = playerContext(state().database, reserve, state().currentDate)!;
    const terms = personalTerms(ctx, state().database.clubs.find((c) => c.id === state().userClubId)!);
    if (!terms.willing) throw new Error('test player should be willing');
    state().signPlayer({ playerId: reserve, fee: askingPrice(ctx), weeklyWage: terms.weeklyWage, years: terms.maxYears });
    flushSave();

    await restartWith(savedFile());
    expect(state().database.contracts.find((c) => c.playerId === reserve)!.clubId).toBe(state().userClubId);
    expect(state().transferHistory[0].playerId).toBe(reserve);
    expect(state().inbox[0].title).toMatch(/signs/);
  });

  it('keeps the transfer list, a release and the inbox after a reload', async () => {
    const own = state().database.contracts.filter((c) => c.clubId === state().userClubId).map((c) => c.playerId);
    const starter = state().lineup.starters.LST!;
    state().toggleTransferListed(own.find((id) => id !== starter)!);
    state().releasePlayer(starter);
    flushSave();
    const before = { listed: state().transferListed, inbox: state().inbox, lineup: state().lineup, contracts: state().database.contracts };

    await restartWith(savedFile());
    expect(useSaveStatus.getState().notice).toBeNull();
    expect({ listed: state().transferListed, inbox: state().inbox, lineup: state().lineup, contracts: state().database.contracts }).toEqual(before);
    expect(state().lineup.starters.LST).not.toBe(starter);
  });

  it('upgrades a version 1 save from before transfers existed', async () => {
    state().playNextFixture();
    flushSave();
    const current = saved();
    const { contracts: _c, clubFinances: _f, transferHistory: _t, transferListed: _l, offers: _o, inbox: _i, condition: _k, attributeChanges: _a, training: _tr, retired: _re, manager: _mg, ...career } =
      current.state;
    await restartWith(JSON.stringify({ state: career, version: 1 }));
    expect(useSaveStatus.getState().notice).toBeNull();
    expect(useSaveStatus.getState().loadedFromSave).toBe(true);
    expect(state().season.fixtures.some((f) => f.result)).toBe(true);
    expect(state().transferHistory).toEqual([]);
  });

  it('round-trips: a played matchday and changed tactics survive a reload', async () => {
    state().applyPlayingStyle('counter');
    state().playNextFixture();
    flushSave();
    const before = { season: state().season, tactics: state().tactics, lineup: state().lineup, currentDate: state().currentDate };

    await restartWith(savedFile());

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
    expect(useSaveStatus.getState().notice).toMatch(/unsupported version/);
  });

  it('stores saves compressed', () => {
    state().playNextFixture();
    flushSave();
    const stored = memory.getItem(SLOT) as string;
    expect(stored.startsWith('z2:')).toBe(true);
    expect(stored.length).toBeLessThan(savedFile().length / 5);
  });

  it('restores the previous save when the latest one is damaged', async () => {
    state().playNextFixture();
    flushSave();
    state().playNextFixture();
    flushSave(); // slot 1 = after matchday 2, its backup = after matchday 1
    const realBackup = memory.getItem(backupKey(SLOT)) as string; // stored (compressed) exactly as the storage made it
    const afterOne = JSON.parse(slotStorage.readBackup(SLOT) as string).state.currentDate;
    const tampered = saved();
    tampered.state.userClubId = 'club_nowhere';
    // Restart with the damaged save but KEEP the backup this time.
    // (The reset below is itself a write that rotates the backup, hence capturing it first.)
    useGameStore.setState(createInitialGameState(state().database));
    flushSave();
    memory.setItem(SLOT, JSON.stringify(tampered));
    memory.setItem(backupKey(SLOT), realBackup);
    await useGameStore.persist.rehydrate();
    expect(useSaveStatus.getState().notice).toMatch(/previous save was restored/);
    expect(state().currentDate).toBe(afterOne);
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

describe('a new season with retirements and a youth intake', () => {
  it('rebuilds the same world after a reload (intakes are regenerated, not saved)', async () => {
    const user = state().userClubId;
    while (state().season.fixtures.some((f) => !f.result && (f.homeId === user || f.awayId === user))) state().playNextFixture();
    state().finishSeason();
    state().startNextSeason();
    const intakeMessage = state().inbox.find((m) => m.from === 'Head of Youth Development');
    expect(intakeMessage?.title).toMatch(/Youth intake/);
    const before = { players: state().database.players, attributes: state().database.attributes, contracts: state().database.contracts };
    expect(before.players.some((p) => Number(p.id.slice(4)) >= 100_000)).toBe(true); // intake players exist
    flushSave();
    const saved = JSON.parse(savedFile());
    expect(JSON.stringify(saved).length).toBeLessThan(1_500_000);

    await restartWith(savedFile());
    expect(useSaveStatus.getState().notice).toBeNull();
    expect({ players: state().database.players, attributes: state().database.attributes, contracts: state().database.contracts }).toEqual(before);
  });
});
