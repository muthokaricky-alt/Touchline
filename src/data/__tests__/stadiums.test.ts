import { buildFictionalDatabase, FICTIONAL_SEED } from '@/data/fictional';
import { stadiumCapacity } from '@/data/fictional/clubs';

describe('stadium capacities', () => {
  const db = buildFictionalDatabase(FICTIONAL_SEED);

  it('are the same on every run and stay between 4,000 and 50,000', () => {
    expect(stadiumCapacity('Kiraka FC', 10)).toBe(stadiumCapacity('Kiraka FC', 10));
    for (const c of db.clubs) {
      expect(c.stadium.capacity).toBeGreaterThanOrEqual(4000);
      expect(c.stadium.capacity).toBeLessThanOrEqual(50_000);
    }
  });

  it('differ between clubs of the same reputation', () => {
    const ken = db.clubs.filter((c) => c.country === 'KEN');
    expect(new Set(ken.map((c) => c.stadium.capacity)).size).toBeGreaterThanOrEqual(ken.length - 2);
    const sameRep = ken.filter((c) => c.reputation === 10);
    expect(sameRep.length).toBeGreaterThan(1);
    expect(new Set(sameRep.map((c) => c.stadium.capacity)).size).toBe(sameRep.length);
  });

  it('still grow with reputation on average, and span a wide range in one league', () => {
    const mean = (rep: number) => {
      const cs = db.clubs.filter((c) => c.reputation === rep);
      return cs.reduce((s, c) => s + c.stadium.capacity, 0) / cs.length;
    };
    expect(mean(16)).toBeGreaterThan(mean(12));
    expect(mean(12)).toBeGreaterThan(mean(8));
    const ken = db.clubs.filter((c) => c.country === 'KEN').map((c) => c.stadium.capacity);
    expect(Math.min(...ken)).toBeLessThan(18_000);
    expect(Math.max(...ken)).toBeGreaterThan(40_000);
  });
});
