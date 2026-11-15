import type { createMemoryStorage } from '@/persistence/debounced-storage';
import { useSaveStatus } from '@/persistence/save-status';
import { LEGACY_SAVE_KEY, slotKey } from '@/persistence/slot-storage';
import { platformStorage } from '@/persistence/storage';

import { createInitialGameState, flushSave, slotStorage, useGameStore } from '../game-store';
import { deleteSlot, exportSlot, importIntoSlot, openActiveSlot, switchSlot } from '../save-slots';

jest.mock('@/persistence/storage', () => {
  const { createMemoryStorage } = jest.requireActual('@/persistence/debounced-storage');
  return { platformStorage: createMemoryStorage() };
});
const memory = platformStorage as ReturnType<typeof createMemoryStorage>;
const state = () => useGameStore.getState();

beforeEach(async () => {
  for (const key of Object.keys(memory.dump())) memory.removeItem(key);
  useGameStore.persist.setOptions({ name: slotKey(1) });
  useGameStore.setState(createInitialGameState(state().database));
  flushSave();
  for (const key of Object.keys(memory.dump())) memory.removeItem(key);
});

describe('save slots', () => {
  it('keeps careers in different slots apart', async () => {
    state().startCareer('Alex', 'club_greywater_town');
    state().playNextFixture();
    flushSave();
    const slotOneDate = state().currentDate;

    await switchSlot(2);
    expect(state().manager).toBeNull(); // empty slot → new-career screen
    state().startCareer('Sam', 'club_kestrel_bay');
    flushSave();

    await switchSlot(1);
    expect(state().manager?.name).toBe('Alex');
    expect(state().currentDate).toBe(slotOneDate);
    await switchSlot(2);
    expect(state().manager?.name).toBe('Sam');
    expect(state().userClubId).toBe('club_kestrel_bay');

    const index = useSaveStatus.getState().slots;
    expect(index[1]?.managerName).toBe('Alex');
    expect(index[2]?.managerName).toBe('Sam');
    expect(useSaveStatus.getState().activeSlot).toBe(2);
    expect(slotStorage.activeSlot()).toBe(2);
  });

  it('deletes a slot; deleting the one being played starts over in it', async () => {
    state().startCareer('Alex', 'club_greywater_town');
    flushSave();
    await switchSlot(2);
    state().startCareer('Sam', 'club_kestrel_bay');
    flushSave();
    await deleteSlot(1);
    expect(useSaveStatus.getState().slots[1]).toBeUndefined();
    expect(state().manager?.name).toBe('Sam'); // still playing slot 2
    await deleteSlot(2);
    expect(state().manager).toBeNull();
    expect(slotStorage.getItem(slotKey(2))).toBeNull();
  });

  it('exports a career and imports it into another slot', async () => {
    state().startCareer('Alex', 'club_greywater_town');
    state().playNextFixture();
    const file = exportSlot(1, new Date('2026-11-16T12:00:00Z'))!;
    expect(file.fileName).toBe('touchline-alex-2026-27-2026-11-16.json');
    const before = { date: state().currentDate, season: state().season, lineup: state().lineup };

    expect(await importIntoSlot(file.contents, 3)).toBeNull();
    expect(useSaveStatus.getState().activeSlot).toBe(3);
    expect({ date: state().currentDate, season: state().season, lineup: state().lineup }).toEqual(before);
    expect(state().manager?.name).toBe('Alex');
  });

  it('rejects files that are not valid saves, without touching the slot', async () => {
    state().startCareer('Alex', 'club_greywater_town');
    flushSave();
    expect(await importIntoSlot('hello', 1)).toMatch(/isn't a Touchline save/);
    expect(await importIntoSlot(JSON.stringify({ format: 'something-else' }), 1)).toMatch(/isn't a Touchline save/);
    const file = JSON.parse(exportSlot(1)!.contents);
    file.save.state.userClubId = 'club_nowhere';
    expect(await importIntoSlot(JSON.stringify(file), 1)).toMatch(/no longer exists/);
    expect(state().manager?.name).toBe('Alex');
  });

  it('moves a save from before slots existed into slot 1 on startup', async () => {
    state().startCareer('Legacy', 'club_greywater_town');
    flushSave();
    const legacy = slotStorage.getItem(slotKey(1)) as string;
    // A fresh app start: a new-game store with nothing waiting to be written, and only the old key on disk.
    useGameStore.setState(createInitialGameState(state().database));
    flushSave();
    for (const key of Object.keys(memory.dump())) memory.removeItem(key);
    memory.setItem(LEGACY_SAVE_KEY, legacy);

    expect(openActiveSlot()).toBe(1);
    await useGameStore.persist.rehydrate();
    expect(state().manager?.name).toBe('Legacy');
    expect(memory.getItem(LEGACY_SAVE_KEY)).toBeNull();
  });
});
