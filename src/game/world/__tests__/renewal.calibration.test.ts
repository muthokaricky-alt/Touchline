import { buildFictionalDatabase, FICTIONAL_REFERENCE_DATE, FICTIONAL_SEED } from '@/data/fictional';
import { checkIntegrity } from '@/data/integrity';
import { type GameDatabase } from '@/data/schemas';
import { assignPotential } from '@/game/development/potential';
import { autoPickLineup, starterIds } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { MAX_SQUAD, squadSize } from '@/game/transfers/complete';
import { processExpiries } from '@/game/transfers/contracts';
import { ageOn } from '@/utils/date';

import { admitIntake, FIRST_INTAKE_YEAR, retirePlayers } from '../renewal';

const base = assignPotential(buildFictionalDatabase(), FICTIONAL_SEED, FICTIONAL_REFERENCE_DATE);
const USER = 'club_greywater_town';

/** One summer of renewal, in the store's order: retire → expiries (AI refills) → intake. */
function summer(db: GameDatabase, year: number): GameDatabase {
  const retired = retirePlayers(db, FICTIONAL_SEED, year).db;
  const expired = processExpiries(retired, USER, `${year}-07-01`).db;
  return admitIntake(expired, FICTIONAL_SEED, year, USER).db;
}

/*
 * Long-run stability over ten simulated summers. Run with `npm run test:calibration`.
 */

describe('ten summers of renewal', () => {
  const years = Array.from({ length: 10 }, (_, i) => FIRST_INTAKE_YEAR + i);
  const worlds: GameDatabase[] = [];
  let db = base;
  for (const year of years) {
    db = summer(db, year);
    worlds.push(db);
  }

  it('prints the trend', () => {
    const row = (w: GameDatabase, year: number) => {
      const date = `${year}-07-01`;
      const free = w.players.length - w.contracts.length;
      const avgAge = w.players.reduce((s, p) => s + ageOn(p.dateOfBirth, date), 0) / w.players.length;
      return `${year}: ${w.players.length} players, ${free} free agents, avg age ${avgAge.toFixed(1)}`;
    };
    console.log(['World over ten summers:', row(base, 2026), ...worlds.map((w, i) => row(w, years[i]))].join('\n'));
  });

  it('stays the same size give or take, with a bounded free-agent pool', () => {
    for (const w of worlds) {
      expect(w.players.length).toBeGreaterThan(800);
      expect(w.players.length).toBeLessThan(1200);
      expect(w.players.length - w.contracts.length).toBeLessThan(250);
    }
  });

  it('keeps every AI club with a playable squad of 18–30', () => {
    // (The user's club isn't managed in this simulation: nobody renews or signs for it.)
    for (const w of worlds) {
      for (const club of w.clubs.filter((c) => c.id !== USER)) {
        const size = squadSize(w, club.id);
        expect(size).toBeGreaterThanOrEqual(18);
        expect(size).toBeLessThanOrEqual(MAX_SQUAD);
      }
    }
    const last = worlds.at(-1)!;
    const xi = starterIds(autoPickLineup(selectSquadCandidates(last, 'club_kestrel_bay'), '4-4-2'));
    expect(xi.filter(Boolean)).toHaveLength(11);
  });

  it('keeps a realistic age profile', () => {
    const last = worlds.at(-1)!;
    const date = `${years.at(-1)}-07-01`;
    const ages = last.players.map((p) => ageOn(p.dateOfBirth, date));
    const avg = ages.reduce((s, a) => s + a, 0) / ages.length;
    expect(avg).toBeGreaterThan(22);
    expect(avg).toBeLessThan(29);
    expect(ages.filter((a) => a >= 38).length).toBeLessThan(10);
    expect(checkIntegrity(last)).toEqual([]);
  });
});
