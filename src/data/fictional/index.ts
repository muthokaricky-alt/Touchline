import { createRng } from '@/utils/random';

import { DATABASE_VERSION, type GameDatabase } from '../schemas';
import {
  ALL_FICTIONAL_CLUBS,
  BACKGROUND_CLUBS,
  CONTINENTAL_CUP,
  FIRST_DIVISION,
  FOREIGN_CUPS,
  FOREIGN_LEAGUE_CLUBS,
  FOREIGN_LEAGUES,
  NATIONAL_CUP,
  SECOND_DIVISION_LEAGUE,
} from './clubs';
import { generateFreeAgents, generateSquad, SQUAD_TEMPLATE } from './generate-squads';
import { FOREIGN_NATIONS_BY_COUNTRY } from './names';

/** Changing the seed reshuffles every generated player. */
export const FICTIONAL_SEED = 20260701;
/** Unattached players available on the transfer market. */
export const FREE_AGENT_COUNT = 60;
/** Start of the fictional 2026/27 season; ages and contracts are relative to it. */
export const FICTIONAL_REFERENCE_DATE = '2026-07-01';

/** Clubs added with the foreign leagues: generated after everything else, in their own random stream. */
export const ABROAD_CLUBS = [...FOREIGN_LEAGUE_CLUBS, ...BACKGROUND_CLUBS];

/**
 * Builds the fictional database: England's 40 clubs in two divisions and a
 * cup, five foreign 18-club leagues, 12 background clubs, 22 generated
 * players per club and a pool of free agents. Deterministic for a given seed.
 *
 * Order matters for old saves: England's clubs and the free agents come
 * first, from the original random stream, so they're exactly as they were
 * before the foreign leagues existed. The clubs abroad come after, from a
 * stream of their own, with player numbers continuing from there.
 */
export function buildFictionalDatabase(seed: number = FICTIONAL_SEED): GameDatabase {
  const rng = createRng(seed);
  const database: GameDatabase = {
    version: DATABASE_VERSION,
    clubs: [...ALL_FICTIONAL_CLUBS],
    competitions: [FIRST_DIVISION, SECOND_DIVISION_LEAGUE, NATIONAL_CUP, ...FOREIGN_LEAGUES, ...FOREIGN_CUPS, CONTINENTAL_CUP],
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

  // Generated AFTER the clubs from the same RNG, so club squads are unchanged.
  const freeAgents = generateFreeAgents({
    rng,
    count: FREE_AGENT_COUNT,
    homeCountry: 'ENG',
    referenceDate: FICTIONAL_REFERENCE_DATE,
    firstPlayerNumber: ALL_FICTIONAL_CLUBS.length * SQUAD_TEMPLATE.length + 1,
  });
  database.players.push(...freeAgents.players);
  database.attributes.push(...freeAgents.attributes);

  // Abroad: own stream (seed mixed with a constant), so nothing above changes.
  const abroadRng = createRng((seed ^ 0x5eed_ab0d) >>> 0);
  const firstAbroad = ALL_FICTIONAL_CLUBS.length * SQUAD_TEMPLATE.length + FREE_AGENT_COUNT + 1;
  ABROAD_CLUBS.forEach((club, i) => {
    const squad = generateSquad({
      rng: abroadRng,
      club,
      referenceDate: FICTIONAL_REFERENCE_DATE,
      firstPlayerNumber: firstAbroad + i * SQUAD_TEMPLATE.length,
      foreignNations: FOREIGN_NATIONS_BY_COUNTRY[club.country],
    });
    database.clubs.push(club);
    database.players.push(...squad.players);
    database.attributes.push(...squad.attributes);
    database.contracts.push(...squad.contracts);
  });

  return database;
}

export {
  ALL_FICTIONAL_CLUBS,
  BACKGROUND_CLUBS,
  CONTINENTAL_CUP,
  COUNTRY_NAMES,
  countryName,
  FICTIONAL_CLUBS,
  FIRST_DIVISION,
  FOREIGN_CUPS,
  FOREIGN_LEAGUE_CLUBS,
  FOREIGN_LEAGUES,
  HOME_COUNTRY,
  NATIONAL_CUP,
  RENAMED_CLUBS,
  SECOND_DIVISION_LEAGUE,
  clubIdFromName,
} from './clubs';
export { FOREIGN_NATIONS_BY_COUNTRY } from './names';
export { generateYouthIntake, SQUAD_TEMPLATE } from './generate-squads';
