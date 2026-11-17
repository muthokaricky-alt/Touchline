import { createMemoryStorage } from '../debounced-storage';
import { deflateSync, strFromU8, strToU8 } from 'fflate';

import { backupKey, compress, createSlotStorage, decompress, fromBase64, LEGACY_SAVE_KEY, slotKey, summarise, toBase64 } from '../slot-storage';

const save = (name: string, label = '2026/27') =>
  JSON.stringify({ state: { userClubId: 'club_greywater_town', manager: { name }, season: { label }, currentDate: '2026-08-08', big: 'x'.repeat(50_000) }, version: 7 });

describe('compression', () => {
  it('round-trips and shrinks repetitive JSON a lot', () => {
    const json = save('Alex');
    const stored = compress(json);
    expect(stored.startsWith('z2:')).toBe(true);
    expect(stored.length).toBeLessThan(json.length / 10);
    expect(decompress(stored)).toBe(json);
  });

  it('stores only plain text characters: no NUL or other control bytes that native storage can cut off', () => {
    const stored = compress(save('Alex'));
    expect(/^z2:[A-Za-z0-9+/]*={0,2}$/.test(stored)).toBe(true);
  });

  it('still reads the older binary-string (z1) saves and uncompressed ones, and rejects damaged data', () => {
    const json = save('Old');
    const z1 = 'z1:' + strFromU8(deflateSync(strToU8(json)), true);
    expect(decompress(z1)).toBe(json);
    expect(decompress('{"state":{}}')).toBe('{"state":{}}');
    expect(() => decompress('z1:' + 'garbage')).toThrow();
    expect(() => decompress('z2:' + 'not*base64')).toThrow();
  });

  it('base64 round-trips every byte value and every length', () => {
    for (let length = 0; length < 300; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + length) % 256);
      expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    }
    expect(toBase64(strToU8('Touchline'))).toBe('VG91Y2hsaW5l'); // same as any standard encoder
  });
});

describe('slot storage', () => {
  const setup = () => {
    const base = createMemoryStorage();
    return { base, slots: createSlotStorage(base, () => 1_000) };
  };

  it('stores compressed, reads back the JSON, and indexes the slot', () => {
    const { base, slots } = setup();
    slots.setItem(slotKey(2), save('Alex'));
    expect((base.getItem(slotKey(2)) as string).startsWith('z2:')).toBe(true);
    expect(slots.getItem(slotKey(2))).toBe(save('Alex'));
    expect(slots.index()[2]).toEqual({ managerName: 'Alex', clubId: 'club_greywater_town', seasonLabel: '2026/27', currentDate: '2026-08-08', savedAt: 1_000 });
  });

  it('keeps the previous save as a backup and falls back to it when the save is damaged', () => {
    const { base, slots } = setup();
    slots.setItem(slotKey(1), save('First'));
    slots.setItem(slotKey(1), save('Second'));
    expect(slots.readBackup(slotKey(1))).toBe(save('First'));
    base.setItem(slotKey(1), 'z1:cut-off-half-way');
    expect(slots.getItem(slotKey(1))).toBe(save('First'));
  });

  it('survives storage that cuts text at the first NUL character, as native storage on a phone can', () => {
    // The bug found on Android: saves came back cut off, so every launch was a new game.
    // The old z1 format contained NUL characters, so it was cut short:
    expect(strFromU8(deflateSync(strToU8(save('Alex'))), true)).toContain('\u0000');
    const memory = createMemoryStorage();
    const native = {
      getItem: memory.getItem,
      removeItem: memory.removeItem,
      setItem: (key: string, value: string) => memory.setItem(key, value.split('\u0000')[0]),
    };
    const slots = createSlotStorage(native, () => 1_000);
    slots.setItem(slotKey(1), save('Alex'));
    slots.setItem(slotKey(1), save('Alex, later'));
    expect(slots.getItem(slotKey(1))).toBe(save('Alex, later'));
  });

  it('fails loudly when the storage changes what it was given, instead of losing the career later', () => {
    const memory = createMemoryStorage();
    const lossy = { getItem: memory.getItem, removeItem: memory.removeItem, setItem: (key: string, value: string) => memory.setItem(key, value.slice(0, -1)) };
    const slots = createSlotStorage(lossy, () => 1_000);
    expect(() => slots.setItem(slotKey(1), save('Alex'))).toThrow(/did not store the save correctly/);
  });

  it('clears a slot completely', () => {
    const { base, slots } = setup();
    slots.setItem(slotKey(3), save('A'));
    slots.setItem(slotKey(3), save('B'));
    slots.clearSlot(3);
    expect(slots.getItem(slotKey(3))).toBeNull();
    expect(base.getItem(backupKey(slotKey(3)))).toBeNull();
    expect(slots.index()[3]).toBeUndefined();
  });

  it('remembers the active slot (1 by default, invalid values ignored)', () => {
    const { base, slots } = setup();
    expect(slots.activeSlot()).toBe(1);
    slots.setActiveSlot(3);
    expect(slots.activeSlot()).toBe(3);
    base.setItem('touchline-active-slot', '9');
    expect(slots.activeSlot()).toBe(1);
  });

  it('moves the pre-slot save into slot 1, once', () => {
    const { base, slots } = setup();
    base.setItem(LEGACY_SAVE_KEY, save('Legacy'));
    slots.migrateLegacy();
    expect(base.getItem(LEGACY_SAVE_KEY)).toBeNull();
    expect(slots.getItem(slotKey(1))).toBe(save('Legacy'));
    expect(slots.index()[1]?.managerName).toBe('Legacy');
    // A later legacy key (shouldn't happen) never overwrites slot 1.
    base.setItem(LEGACY_SAVE_KEY, save('Other'));
    slots.migrateLegacy();
    expect(slots.getItem(slotKey(1))).toBe(save('Legacy'));
  });

  it('summarise ignores anything that is not a save', () => {
    expect(summarise('not json', 0)).toBeNull();
    expect(summarise('{"state":{}}', 0)).toBeNull();
  });
});
