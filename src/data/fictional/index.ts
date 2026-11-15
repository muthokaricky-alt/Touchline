import { createRng } from '@/utils/random';

import { DATABASE_VERSION, type GameDatabase } from '../schemas';
import { FICTIONAL_CLUBS, FICTIONAL_LEAGUE } from './clubs';
import { generateSquad, SQUAD_TEMPLATE } from './generate-squads';

/** Changing the seed reshuffles every generated player. */
export const FICTIONAL_SEED = 20260701;
/** Start of the fictional 2026/27 season; ages and contracts are relative to it. */
export const FICTIONAL_REFERENCE_DATE = '2026-07-01';

/**
 * Builds the fictional test database: 8 hand-written clubs, 1 league and
 * 22 generated players per club. Deterministic for a given seed.
 */
export function buildFictionalDatabase(seed: number = FICTIONAL_SEED): GameDatabase {
  const rng = createRng(seed);
  const database: GameDatabase = {
    version: DATABASE_VERSION,
    clubs: [...FICTIONAL_CLUBS],
    competitions: [FICTIONAL_LEAGUE],
    players: [],
    attributes: [],
    contracts: [],
  };

  FICTIONAL_CLUBS.forEach((club, clubIndex) => {
    const squad = generateSquad({
      rng,
      club,
      referenceDate: FICTIONAL_REFERENCE_DATE,
      firstPlayerNumber: clubIndex * SQUAD_TEMPLATE.length + 1,
    });
    database.players.push(...squad.players);
    database.attributes.push(...squad.attributes);
    database.contracts.push(...squad.contracts);
  });

  return database;
}

export { FICTIONAL_CLUBS, FICTIONAL_LEAGUE } from './clubs';
