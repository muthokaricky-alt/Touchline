import { createRng } from '../random';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next());
  });

  it('next() stays within [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('int() is inclusive at both ends and hits every value', () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const value = rng.int(3, 8);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(8);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('int() works when min equals max', () => {
    expect(createRng(1).int(5, 5)).toBe(5);
  });

  it('int() rejects bad ranges', () => {
    const rng = createRng(1);
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.int(1.5, 3)).toThrow(RangeError);
  });

  it('chance() roughly matches its probability', () => {
    const rng = createRng(2024);
    const hits = Array.from({ length: 10_000 }, () => rng.chance(0.3)).filter(Boolean).length;
    expect(hits / 10_000).toBeCloseTo(0.3, 1);
  });

  it('pick() returns an element and rejects empty arrays', () => {
    const rng = createRng(5);
    const items = ['a', 'b', 'c'] as const;
    expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});
