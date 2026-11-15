import { z } from 'zod';

import { ClubSchema } from './club';
import { CompetitionSchema } from './competition';
import { ContractSchema, PlayerAttributesSchema, PlayerSchema } from './player';

/** Bump when the shape changes so old data/saves can be detected and migrated. */
export const DATABASE_VERSION = 1;

/**
 * The whole game dataset: flat lists of records linked by IDs, the same
 * layout as future SQLite tables. Zod validates each record; cross-record
 * rules (does this contract's player exist?) live in `../integrity.ts`.
 */
export const GameDatabaseSchema = z.strictObject({
  version: z.literal(DATABASE_VERSION),
  clubs: z.array(ClubSchema),
  competitions: z.array(CompetitionSchema),
  players: z.array(PlayerSchema),
  attributes: z.array(PlayerAttributesSchema),
  contracts: z.array(ContractSchema),
});

export type GameDatabase = z.infer<typeof GameDatabaseSchema>;
