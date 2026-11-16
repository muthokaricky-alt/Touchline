import { buildFictionalDatabase } from '@/data/fictional';
import { compress } from '@/persistence/slot-storage';

import { createSeason, playRemaining } from '../season-flow';

/**
 * A whole season in the FULL world (England + the leagues abroad), played
 * out: is it small enough to save? Slow (a few seconds), so it runs with
 * `npm run test:calibration` / `test:all`.
 */
describe('a full season in the full world', () => {
  const db = buildFictionalDatabase();
  const finished = playRemaining(db, createSeason(db, 2026, 99)).season;

  it('keeps a season small enough to save', () => {
    // ~2.4 MB of JSON with the leagues abroad (was ~0.9 MB); saves are compressed (persistence/slot-storage),
    // which is what's measured here: ~205 KB.
    const json = JSON.stringify(finished);
    expect(json.length).toBeLessThan(3_000_000);
    expect(compress(json).length).toBeLessThan(350_000);
  });

  it('plays every league to the end, abroad too', () => {
    expect(finished.fixtures.every((f) => f.result)).toBe(true);
    expect(finished.fixtures.filter((f) => f.competitionId === 'comp_spain_premier')).toHaveLength(306);
  });
});
