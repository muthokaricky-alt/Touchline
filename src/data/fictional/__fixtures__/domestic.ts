import { isLeague, type GameDatabase } from '../../schemas';
import { HOME_COUNTRY } from '../clubs';

/**
 * Test helper: the generated world cut down to England (40 clubs in two
 * divisions, the National Cup and the free agents), dropping the 102 clubs
 * abroad and their players.
 *
 * Why: most tests that play whole seasons check general season logic
 * (tables, the cup, reviews, views). In the full world each season plays
 * three times as many matches, which made `npm test` ~85 s. Season logic
 * works on any world, so these tests use this one; tests about the world
 * abroad keep the full world. England's clubs and players are exactly the
 * same objects as in the full world (it's a filter, nothing is regenerated).
 *
 * Outside __tests__ so Jest doesn't run it as a suite.
 */
export function domesticWorld(db: GameDatabase): GameDatabase {
  const clubs = db.clubs.filter((c) => c.country === HOME_COUNTRY);
  const clubIds = new Set(clubs.map((c) => c.id));
  const contracts = db.contracts.filter((c) => clubIds.has(c.clubId));
  const abroad = new Set(db.contracts.filter((c) => !clubIds.has(c.clubId)).map((c) => c.playerId));
  return {
    ...db,
    clubs,
    competitions: db.competitions.filter((c) => c.country === HOME_COUNTRY || (isLeague(c) && c.clubIds.every((id) => clubIds.has(id)))),
    players: db.players.filter((p) => !abroad.has(p.id)),
    attributes: db.attributes.filter((a) => !abroad.has(a.playerId)),
    contracts,
  };
}

/**
 * For `jest.mock('@/data/fictional', …)` in store tests: the real module, with
 * `buildFictionalDatabase` returning the domestic world. Every part of the
 * game that generates the world (the store's base world, save checks, save
 * migrations) then agrees on it.
 */
export function domesticFictionalModule(actual: typeof import('../index')): typeof import('../index') {
  return { ...actual, buildFictionalDatabase: (seed?: number) => domesticWorld(actual.buildFictionalDatabase(seed)) };
}
