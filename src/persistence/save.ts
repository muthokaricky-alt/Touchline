import { z } from 'zod';

import { ClubIdSchema, IsoDateSchema, type GameDatabase } from '@/data/schemas';
import { LineupSchema } from '@/game/lineup';
import { SeasonSchema } from '@/game/season/season';
import { TacticsSchema } from '@/game/tactics/tactics';

/**
 * The save file: what's stored, and how it's checked when loaded.
 *
 * The database isn't saved: it's regenerated from `worldSeed` (deterministic).
 * When transfers/development start changing it (M7/M8), it must be saved too
 * and SAVE_VERSION bumped, with a migration.
 *
 * Loading is two-stage, like the data layer: Zod checks the shape, then
 * cross-checks make sure the save fits the world it's loaded into (clubs and
 * players exist, the lineup is the user's own players).
 */

export const SAVE_KEY = 'touchline-save';
export const SAVE_VERSION = 1;

export const GameSaveSchema = z.strictObject({
  worldSeed: z.int(),
  userClubId: ClubIdSchema,
  currentDate: IsoDateSchema,
  lineup: LineupSchema,
  tactics: TacticsSchema,
  season: SeasonSchema,
});

export type GameSave = z.infer<typeof GameSaveSchema>;

export type SaveCheck = { ok: true; save: GameSave } | { ok: false; reason: string };

/** Marker returned by persist's `migrate` for saves from another SAVE_VERSION. */
export type IncompatibleSave = { incompatibleVersion: number };

export const isIncompatible = (value: unknown): value is IncompatibleSave =>
  typeof value === 'object' && value !== null && 'incompatibleVersion' in value;

export function checkSave(raw: unknown, db: GameDatabase, worldSeed: number): SaveCheck {
  if (isIncompatible(raw)) {
    return { ok: false, reason: `Your save is from an older version of Touchline (format ${raw.incompatibleVersion}) and couldn't be loaded.` };
  }
  const parsed = GameSaveSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, reason: `Your save is damaged (${first.path.map(String).join('.') || 'save'}: ${first.message}).` };
  }
  const save = parsed.data;

  if (save.worldSeed !== worldSeed) return { ok: false, reason: 'Your save was made with a different game world.' };

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

  return { ok: true, save };
}
