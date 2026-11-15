import { z } from 'zod';

import { buildFictionalDatabase } from '@/data/fictional';
import { checkIntegrity } from '@/data/integrity';
import { ClubIdSchema, ContractSchema, IsoDateSchema, MoneySchema, NonNegativeMoneySchema, type GameDatabase } from '@/data/schemas';
import { LineupSchema } from '@/game/lineup';
import { SeasonSchema } from '@/game/season/season';
import { TacticsSchema } from '@/game/tactics/tactics';
import { TransferRecordSchema } from '@/game/transfers/complete';

/**
 * The save file: what's stored, how old formats are upgraded, and how it's
 * checked when loaded.
 *
 * The world is "generated base + saved changes": players and attributes are
 * rebuilt from `worldSeed` (deterministic); what transfers change, contracts
 * and club finances, is saved and laid over the base on load.
 *
 * Versions:
 *   1  career only (club, date, lineup, tactics, season)
 *   2  + contracts, club finances, transfer history (Milestone 7)
 */

export const SAVE_KEY = 'touchline-save';
export const SAVE_VERSION = 2;

const ClubFinancesSchema = z.strictObject({
  clubId: ClubIdSchema,
  balance: MoneySchema,
  transferBudget: NonNegativeMoneySchema,
  weeklyWageBudget: NonNegativeMoneySchema,
});

export const GameSaveSchema = z.strictObject({
  worldSeed: z.int(),
  userClubId: ClubIdSchema,
  currentDate: IsoDateSchema,
  lineup: LineupSchema,
  tactics: TacticsSchema,
  season: SeasonSchema,
  contracts: z.array(ContractSchema),
  clubFinances: z.array(ClubFinancesSchema),
  transferHistory: z.array(TransferRecordSchema),
});

export type GameSave = z.infer<typeof GameSaveSchema>;
export type ClubFinancesSave = z.infer<typeof ClubFinancesSchema>;

/** Marker for a save that can't be upgraded (unknown/future version). */
export type IncompatibleSave = { incompatibleVersion: number };

export const isIncompatible = (value: unknown): value is IncompatibleSave =>
  typeof value === 'object' && value !== null && 'incompatibleVersion' in value;

/** The parts of a database that a save stores. */
export function worldChanges(db: GameDatabase): Pick<GameSave, 'contracts' | 'clubFinances'> {
  return {
    contracts: db.contracts,
    clubFinances: db.clubs.map((c) => ({ clubId: c.id, ...c.finances })),
  };
}

/** Lays saved contracts and finances over the generated base world. */
export function applyWorldChanges(base: GameDatabase, save: Pick<GameSave, 'contracts' | 'clubFinances'>): GameDatabase {
  const finances = new Map(save.clubFinances.map((f) => [f.clubId, f]));
  return {
    ...base,
    contracts: save.contracts,
    clubs: base.clubs.map((club) => {
      const f = finances.get(club.id);
      return f ? { ...club, finances: { balance: f.balance, transferBudget: f.transferBudget, weeklyWageBudget: f.weeklyWageBudget } } : club;
    }),
  };
}

/**
 * Upgrades an older save to SAVE_VERSION (called by persist's `migrate`).
 * v1 → v2: nothing had been transferred yet, so the generated world's
 * contracts and finances ARE the v1 world.
 */
export function migrateSave(raw: unknown, fromVersion: number): unknown {
  if (fromVersion === 1 && typeof raw === 'object' && raw !== null && 'worldSeed' in raw && typeof raw.worldSeed === 'number') {
    return { ...raw, ...worldChanges(buildFictionalDatabase(raw.worldSeed)), transferHistory: [] };
  }
  return { incompatibleVersion: fromVersion } satisfies IncompatibleSave;
}

export type SaveCheck = { ok: true; save: GameSave; database: GameDatabase } | { ok: false; reason: string };

/**
 * Validates a save against the base world it will be loaded into, and
 * returns the rebuilt world. Shape (Zod) → world consistency (the data
 * layer's integrity check) → career checks.
 */
export function checkSave(raw: unknown, base: GameDatabase, worldSeed: number): SaveCheck {
  if (isIncompatible(raw)) {
    return { ok: false, reason: `Your save is from an unsupported version of Touchline (format ${raw.incompatibleVersion}) and couldn't be loaded.` };
  }
  const parsed = GameSaveSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, reason: `Your save is damaged (${first.path.map(String).join('.') || 'save'}: ${first.message}).` };
  }
  const save = parsed.data;
  if (save.worldSeed !== worldSeed) return { ok: false, reason: 'Your save was made with a different game world.' };

  const db = applyWorldChanges(base, save);
  const issues = checkIntegrity(db);
  if (issues.length) return { ok: false, reason: `Your save's player contracts are inconsistent (${issues[0].message}).` };

  const clubIds = new Set(db.clubs.map((c) => c.id));
  if (!clubIds.has(save.userClubId)) return { ok: false, reason: 'Your save refers to a club that no longer exists.' };

  const ownPlayers = new Set(db.contracts.filter((c) => c.clubId === save.userClubId).map((c) => c.playerId));
  const selected = [...Object.values(save.lineup.starters).filter((id): id is string => id !== null), ...save.lineup.substitutes];
  if (selected.some((id) => !ownPlayers.has(id))) return { ok: false, reason: "Your saved lineup includes players who aren't at your club." };

  const competitionIds = new Set(db.competitions.map((c) => c.id));
  const seasonClubs = [...save.season.leagues.flatMap((l) => l.clubIds), ...save.season.fixtures.flatMap((f) => [f.homeId, f.awayId])];
  if (save.season.leagues.some((l) => !competitionIds.has(l.competitionId)) || seasonClubs.some((id) => !clubIds.has(id))) {
    return { ok: false, reason: 'Your saved season refers to clubs or competitions that no longer exist.' };
  }
  if (!save.season.leagues.some((l) => l.clubIds.includes(save.userClubId))) {
    return { ok: false, reason: "Your club isn't in any league in the saved season." };
  }

  return { ok: true, save, database: db };
}
