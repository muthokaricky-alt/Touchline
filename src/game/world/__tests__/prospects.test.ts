import { buildFictionalDatabase, FICTIONAL_SEED } from '@/data/fictional';
import { assignPotential, potentialOf } from '@/game/development/potential';
import { ageOn } from '@/utils/date';

import {
  FIRST_PROSPECT_YEAR,
  generatedProspects,
  isProspectId,
  PROSPECTS_MAX,
  PROSPECTS_MIN,
  prospectNations,
  prospectPlayerNumber,
  prospectYear,
} from '../prospects';
import { admitIntake, retirePlayers, worldFor } from '../renewal';

const base = assignPotential(buildFictionalDatabase(FICTIONAL_SEED), FICTIONAL_SEED, '2026-07-01');
const USER = base.clubs[0].id;
const pools = generatedProspects(base.clubs, FICTIONAL_SEED, 2027);

describe('youth prospects', () => {
  it('makes a pool for every country with clubs, of 16–17-year-olds from that country', () => {
    expect(pools.map((p) => p.nation)).toEqual(prospectNations(base.clubs));
    expect(pools.length).toBeGreaterThanOrEqual(5);
    for (const pool of pools) {
      expect(pool.players.length).toBeGreaterThanOrEqual(PROSPECTS_MIN);
      expect(pool.players.length).toBeLessThanOrEqual(PROSPECTS_MAX);
      expect(pool.attributes).toHaveLength(pool.players.length);
      for (const p of pool.players) {
        expect(p.nationality).toBe(pool.nation);
        expect(ageOn(p.dateOfBirth, '2027-07-01')).toBeGreaterThanOrEqual(16);
        expect(ageOn(p.dateOfBirth, '2027-07-01')).toBeLessThanOrEqual(17);
        expect(isProspectId(p.id)).toBe(true);
        expect(prospectYear(p.id)).toBe(2027);
      }
    }
  });

  it('is regenerated identically (saves rely on it) and differs between years', () => {
    expect(generatedProspects(buildFictionalDatabase(FICTIONAL_SEED).clubs, FICTIONAL_SEED, 2027)).toEqual(pools);
    const next = generatedProspects(base.clubs, FICTIONAL_SEED, 2028);
    expect(next[0].players[0].id).not.toBe(pools[0].players[0].id);
  });

  it('uses ids clear of the base world, club intakes and other years', () => {
    const ids = [2027, 2028, 2029].flatMap((y) => generatedProspects(base.clubs, FICTIONAL_SEED, y).flatMap((p) => p.players.map((x) => x.id)));
    expect(new Set(ids).size).toBe(ids.length);
    const world = worldFor(base, FICTIONAL_SEED, 2029);
    expect(new Set(world.players.map((p) => p.id)).size).toBe(world.players.length);
    expect(isProspectId(base.players[0].id)).toBe(false);
    expect(isProspectId('plr_127032')).toBe(false); // a club intake id
    expect(isProspectId('plr_1270000')).toBe(false);
    expect(prospectPlayerNumber(2027, 3, 2)).toBe(2_270_302);
  });

  it('has a few real wonderkids and mostly ordinary players', () => {
    const all = [2027, 2028, 2029, 2030].flatMap((y) =>
      generatedProspects(base.clubs, FICTIONAL_SEED, y).flatMap((p) => p.players.map((x, i) => potentialOf(x, p.attributes[i]))),
    );
    const share = (pred: (x: number) => boolean) => all.filter(pred).length / all.length;
    expect(share((x) => x >= 16)).toBeGreaterThan(0.05);
    expect(share((x) => x >= 16)).toBeLessThan(0.25);
    expect(share((x) => x < 13)).toBeGreaterThan(0.4);
  });

  it('joins the world from the first prospect summer, with no contract', () => {
    expect(FIRST_PROSPECT_YEAR).toBe(2027);
    expect(worldFor(base, FICTIONAL_SEED, 2026).players.some((p) => isProspectId(p.id))).toBe(false);
    const world = worldFor(base, FICTIONAL_SEED, 2027);
    const ids = new Set(pools.flatMap((p) => p.players.map((x) => x.id)));
    expect(world.players.filter((p) => ids.has(p.id))).toHaveLength(ids.size);

    const admitted = admitIntake(base, FICTIONAL_SEED, 2027, USER).db;
    const contracted = new Set(admitted.contracts.map((c) => c.playerId));
    for (const id of ids) {
      expect(admitted.players.some((p) => p.id === id)).toBe(true);
      expect(contracted.has(id)).toBe(false);
    }
  });

  it('gives up on football when nobody signs them by the next summer, but not once signed', () => {
    let db = admitIntake(base, FICTIONAL_SEED, 2027, USER).db;
    const [signed, ...rest] = pools[0].players;
    db = { ...db, contracts: [...db.contracts, { playerId: signed.id, clubId: USER, weeklyWage: 500, startDate: '2027-08-01', endDate: '2030-06-30' } as never] };
    const next = retirePlayers(db, FICTIONAL_SEED, 2028);
    const left = new Set(next.leavers.filter((l) => l.reason === 'quit').map((l) => l.playerId));
    for (const p of rest) expect(left.has(p.id)).toBe(true);
    expect(left.has(signed.id)).toBe(false);
    expect(next.db.players.some((p) => p.id === signed.id)).toBe(true);
    // This summer's own pool isn't touched by this summer's rollover.
    const sameYear = retirePlayers(db, FICTIONAL_SEED, 2027);
    expect(sameYear.leavers.some((l) => isProspectId(l.playerId) && l.reason === 'quit')).toBe(false);
  });
});
