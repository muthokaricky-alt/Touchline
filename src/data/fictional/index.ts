import { createRng } from '@/utils/random';

import { DATABASE_VERSION, type GameDatabase } from '../schemas';
import { ALL_FICTIONAL_CLUBS, FIRST_DIVISION, NATIONAL_CUP, SECOND_DIVISION_LEAGUE } from './clubs';
import { generateSquad, SQUAD_TEMPLATE } from './generate-squads';

/** Changing the seed reshuffles every generated player. */
export const FICTIONAL_SEED = 20260701;
/** Start of the fictional 2026/27 season; ages and contracts are relative to it. */
export const FICTIONAL_REFERENCE_DATE = '2026-07-01';

/**
 * Builds the fictional test database: 40 clubs in two divisions, a cup, and
 * 22 generated players per club. Deterministic for a given seed.
 */
export function buildFictionalDatabase(seed: number = FICTIONAL_SEED): GameDatabase {
  const rng = createRng(seed);
  const database: GameDatabase = {
    version: DATABASE_VERSION,
    clubs: [...ALL_FICTIONAL_CLUBS],
    competitions: [FIRST_DIVISION, SECOND_DIVISION_LEAGUE, NATIONAL_CUP],
    players: [],
    attributes: [],
    contracts: [],
  };

  ALL_FICTIONAL_CLUBS.forEach((club, clubIndex) => {
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

export { ALL_FICTIONAL_CLUBS, FICTIONAL_CLUBS, FIRST_DIVISION, NATIONAL_CUP, SECOND_DIVISION_LEAGUE } from './clubs';
