import { createDebouncedStorage, createMemoryStorage } from '../debounced-storage';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('createDebouncedStorage', () => {
  it('writes once after the wait, with the latest value', () => {
    const base = createMemoryStorage();
    const writes: number[] = [];
    const { storage } = createDebouncedStorage(base, 1000, { onWrite: () => writes.push(Date.now()) });

    for (let i = 0; i < 50; i++) storage.setItem('save', `v${i}`);
    expect(base.getItem('save')).toBeNull();
    jest.advanceTimersByTime(999);
    expect(base.getItem('save')).toBeNull();
    jest.advanceTimersByTime(1);
    expect(base.getItem('save')).toBe('v49');
    expect(writes).toHaveLength(1);
  });

  it('reads the pending value before it is written', () => {
    const base = createMemoryStorage({ save: 'old' });
    const { storage } = createDebouncedStorage(base, 1000);
    expect(storage.getItem('save')).toBe('old');
    storage.setItem('save', 'new');
    expect(storage.getItem('save')).toBe('new');
  });

  it('flush writes immediately and cancels the timer', () => {
    const base = createMemoryStorage();
    const { storage, flush } = createDebouncedStorage(base, 1000);
    storage.setItem('save', 'now');
    flush();
    expect(base.getItem('save')).toBe('now');
    base.setItem('save', 'changed elsewhere');
    jest.advanceTimersByTime(2000);
    expect(base.getItem('save')).toBe('changed elsewhere');
  });

  it('removeItem drops pending writes', () => {
    const base = createMemoryStorage({ save: 'x' });
    const { storage } = createDebouncedStorage(base, 1000);
    storage.setItem('save', 'pending');
    storage.removeItem('save');
    jest.advanceTimersByTime(2000);
    expect(base.getItem('save')).toBeNull();
  });

  it('reports storage errors instead of throwing', () => {
    const errors: unknown[] = [];
    const broken = {
      getItem: () => {
        throw new Error('read failed');
      },
      setItem: () => {
        throw new Error('disk full');
      },
      removeItem: () => undefined,
    };
    const { storage, flush } = createDebouncedStorage(broken, 1000, { onError: (e) => errors.push(e) });
    expect(storage.getItem('save')).toBeNull();
    storage.setItem('save', 'x');
    expect(() => flush()).not.toThrow();
    expect(errors.map((e) => (e as Error).message)).toEqual(['read failed', 'disk full']);
  });
});
