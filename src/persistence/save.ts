import { z } from 'zod';

import { buildFictionalDatabase } from '@/data/fictional';
import { checkIntegrity } from '@/data/integrity';
import {
  ATTRIBUTE_KEYS,
  AttributeValueSchema,
  ClubIdSchema,
  ContractSchema,
  IsoDateSchema,
  MoneySchema,
  NonNegativeMoneySchema,
  PlayerIdSchema,
  type AttributeGroup,
  type AttributeKey,
  type GameDatabase,
  type PlayerAttributes,
} from '@/data/schemas';
import { ManagerSchema } from '@/game/career/manager';
import { ConditionStateSchema, emptyConditions } from '@/game/condition/condition';
import { DEFAULT_TRAINING, TrainingSchema } from '@/game/development/development';
import { InboxMessageSchema } from '@/game/inbox/inbox';
import { LineupSchema } from '@/game/lineup';
import { TransferOfferSchema } from '@/game/transfers/offers';
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
 *   2  + contracts, club finances, transfer history (Milestone 7a)
 *   3  + transfer list, pending offers, inbox (Milestone 7b)
 *   4  + player condition: fitness, morale, injuries (Milestone 8a)
 *   5  + changed attributes (development), training settings (Milestone 8b)
 *   6  + retired players (Milestone 9a). Youth intakes aren't saved: they're
 *        regenerated from the seed (game/world/renewal.ts worldFor).
 *   7  + manager: name, reputation, board confidence, history (Milestone 9b)
 */

export const SAVE_VERSION = 7;

const ClubFinancesSchema = z.strictObject({
  clubId: ClubIdSchema,
  balance: MoneySchema,
  transferBudget: NonNegativeMoneySchema,
  weeklyWageBudget: NonNegativeMoneySchema,
});

/** Which group each attribute lives in (to rebuild the nested record from a flat change list). */
const GROUP_OF = new Map<AttributeKey, AttributeGroup>(
  (Object.entries(ATTRIBUTE_KEYS) as [AttributeGroup, readonly AttributeKey[]][]).flatMap(([group, keys]) => keys.map((k) => [k, group] as const)),
);
const AttributeKeySchema = z.enum([...GROUP_OF.keys()] as [AttributeKey, ...AttributeKey[]]);

/** Only attributes that differ from the generated world, e.g. { plr_0007: { finishing: 13 } }. */
const AttributeChangesSchema = z.record(PlayerIdSchema, z.partialRecord(AttributeKeySchema, AttributeValueSchema));
export type AttributeChanges = z.infer<typeof AttributeChangesSchema>;

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
  transferListed: z.array(PlayerIdSchema),
  offers: z.array(TransferOfferSchema),
  inbox: z.array(InboxMessageSchema),
  condition: ConditionStateSchema,
  attributeChanges: AttributeChangesSchema,
  training: TrainingSchema,
  /** Players of the season's generated world who have retired (or left football). */
  retired: z.array(PlayerIdSchema),
  /** Null until a career has been started (the new-career screen is showing). */
  manager: ManagerSchema.nullable(),
});

export type GameSave = z.infer<typeof GameSaveSchema>;
export type ClubFinancesSave = z.infer<typeof ClubFinancesSchema>;

/** Marker for a save that can't be upgraded (unknown/future version). */
export type IncompatibleSave = { incompatibleVersion: number };

export const isIncompatible = (value: unknown): value is IncompatibleSave =>
  typeof value === 'object' && value !== null && 'incompatibleVersion' in value;

type WorldChanges = Pick<GameSave, 'contracts' | 'clubFinances' | 'attributeChanges' | 'retired'>;

/** Attributes that differ from the base world (players unchanged since generation aren't listed). */
export function attributeChanges(db: GameDatabase, base: GameDatabase): AttributeChanges {
  const baseById = new Map(base.attributes.map((a) => [a.playerId, a]));
  const changes: AttributeChanges = {};
  for (const attrs of db.attributes) {
    const original = baseById.get(attrs.playerId);
    if (!original) continue;
    const changed: Partial<Record<AttributeKey, number>> = {};
    for (const [key, group] of GROUP_OF) {
      const value = (attrs[group] as Record<AttributeKey, number>)[key];
      if (value !== (original[group] as Record<AttributeKey, number>)[key]) changed[key] = value;
    }
    if (Object.keys(changed).length) changes[attrs.playerId] = changed;
  }
  return changes;
}

/** The parts of a database that a save stores. */
export function worldChanges(db: GameDatabase, base: GameDatabase): WorldChanges {
  const present = new Set(db.players.map((p) => p.id));
  return {
    contracts: db.contracts,
    clubFinances: db.clubs.map((c) => ({ clubId: c.id, ...c.finances })),
    attributeChanges: attributeChanges(db, base),
    retired: base.players.filter((p) => !present.has(p.id)).map((p) => p.id),
  };
}

function applyAttributeChanges(attrs: PlayerAttributes, changed: Partial<Record<AttributeKey, number>>): PlayerAttributes {
  const next = { ...attrs } as Record<AttributeGroup, Record<AttributeKey, number>> & PlayerAttributes;
  for (const [key, value] of Object.entries(changed) as [AttributeKey, number][]) {
    const group = GROUP_OF.get(key)!;
    next[group] = { ...next[group], [key]: value };
  }
  return next;
}

/** Lays saved contracts, finances, attribute changes and retirements over the generated world. */
export function applyWorldChanges(base: GameDatabase, save: WorldChanges): GameDatabase {
  const finances = new Map(save.clubFinances.map((f) => [f.clubId, f]));
  const retired = new Set(save.retired);
  return {
    ...base,
    players: base.players.filter((p) => !retired.has(p.id)),
    contracts: save.contracts,
    clubs: base.clubs.map((club) => {
      const f = finances.get(club.id);
      return f ? { ...club, finances: { balance: f.balance, transferBudget: f.transferBudget, weeklyWageBudget: f.weeklyWageBudget } } : club;
    }),
    attributes: base.attributes
      .filter((a) => !retired.has(a.playerId))
      .map((a) => {
        const changed = save.attributeChanges[a.playerId];
        return changed ? applyAttributeChanges(a, changed) : a;
      }),
  };
}

/**
 * Upgrades an older save to SAVE_VERSION (called by persist's `migrate`).
 * Steps run in sequence, so a v1 save goes 1 → 2 → 3.
 *   v1 → v2: nothing had been transferred yet, so the generated world's
 *            contracts and finances ARE the v1 world.
 *   v2 → v3: no transfer list, offers or inbox existed yet: start empty.
 *   v3 → v4: condition didn't exist: everyone fully fit on the save's date.
 *   v4 → v5: no development yet: no attribute changes, default training.
 *   v5 → v6: nobody had retired yet.
 *   v6 → v7: careers from before the manager existed carry on with a default manager.
 */
export function migrateSave(raw: unknown, fromVersion: number): unknown {
  const incompatible = { incompatibleVersion: fromVersion } satisfies IncompatibleSave;
  if (typeof raw !== 'object' || raw === null || fromVersion < 1 || fromVersion >= SAVE_VERSION) return incompatible;
  let save: Record<string, unknown> = { ...raw };
  if (fromVersion < 2) {
    if (!('worldSeed' in save) || typeof save.worldSeed !== 'number') return incompatible;
    const generated = buildFictionalDatabase(save.worldSeed);
    const { contracts, clubFinances } = worldChanges(generated, generated);
    save = { ...save, contracts, clubFinances, transferHistory: [] };
  }
  if (fromVersion < 3) save = { ...save, transferListed: [], offers: [], inbox: [] };
  if (fromVersion < 4) {
    if (typeof save.currentDate !== 'string') return incompatible;
    save = { ...save, condition: emptyConditions(save.currentDate) };
  }
  if (fromVersion < 5) save = { ...save, attributeChanges: {}, training: DEFAULT_TRAINING };
  if (fromVersion < 6) save = { ...save, retired: [] };
  if (fromVersion < 7) {
    save = { ...save, manager: { name: 'Manager', reputation: 50, confidence: 60, warned: false, sackedOffers: null, history: [] } };
  }
  return save;
}

export type SaveCheck = { ok: true; save: GameSave; database: GameDatabase } | { ok: false; reason: string };

/**
 * Validates a save against the generated world it will be loaded into, and
 * returns the rebuilt world. Shape (Zod) → world consistency (the data
 * layer's integrity check) → career checks. `baseFor(startYear)` gives the
 * generated world for the save's season (the base plus youth intakes).
 */
export function checkSave(raw: unknown, baseFor: (startYear: number) => GameDatabase, worldSeed: number): SaveCheck {
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

  const base = baseFor(save.season.startYear);
  const baseIds = new Set(base.players.map((p) => p.id));
  if (save.retired.some((id) => !baseIds.has(id))) return { ok: false, reason: "Your save's retired players don't match this world." };
  const db = applyWorldChanges(base, save);
  const issues = checkIntegrity(db);
  if (issues.length) return { ok: false, reason: `Your save's player contracts are inconsistent (${issues[0].message}).` };

  const clubIds = new Set(db.clubs.map((c) => c.id));
  if (!clubIds.has(save.userClubId)) return { ok: false, reason: 'Your save refers to a club that no longer exists.' };
  const managerClubs = save.manager ? [...save.manager.history.map((h) => h.clubId), ...(save.manager.sackedOffers ?? [])] : [];
  if (managerClubs.some((id) => !clubIds.has(id))) return { ok: false, reason: "Your save's career history refers to clubs that don't exist." };

  const ownPlayers = new Set(db.contracts.filter((c) => c.clubId === save.userClubId).map((c) => c.playerId));
  const selected = [...Object.values(save.lineup.starters).filter((id): id is string => id !== null), ...save.lineup.substitutes];
  if (selected.some((id) => !ownPlayers.has(id))) return { ok: false, reason: "Your saved lineup includes players who aren't at your club." };

  const competitionIds = new Set(db.competitions.map((c) => c.id));
  const seasonClubs = [...save.season.leagues.flatMap((l) => l.clubIds), ...save.season.fixtures.flatMap((f) => [f.homeId, f.awayId])];
  if (save.season.leagues.some((l) => !competitionIds.has(l.competitionId)) || seasonClubs.some((id) => !clubIds.has(id))) {
    return { ok: false, reason: 'Your saved season refers to clubs or competitions that no longer exist.' };
  }
  const playerIds = new Set(db.players.map((p) => p.id));
  if (Object.keys(save.attributeChanges).some((id) => !playerIds.has(id))) {
    return { ok: false, reason: "Your save's player development records don't match this world." };
  }
  if (Object.keys(save.condition.players).some((id) => !playerIds.has(id)) || save.condition.date > save.currentDate) {
    return { ok: false, reason: "Your save's player fitness records don't match this world." };
  }
  if (!save.season.leagues.some((l) => l.clubIds.includes(save.userClubId))) {
    return { ok: false, reason: "Your club isn't in any league in the saved season." };
  }

  return { ok: true, save, database: db };
}
