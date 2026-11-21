import { z } from 'zod';

import { IsoDateSchema, PlayerIdSchema, PositionSchema, type ClubId, type GameDatabase, type Player, type PlayerId, type Position } from '@/data/schemas';
import { addDays } from '@/utils/date';

import type { NewMessage } from '../inbox/inbox';
import { POSITION_NAMES } from '../positions';
import { positionRating } from '../ratings';
import { fullName } from './squad-selectors';

/**
 * Retraining: teaching a player a new position.
 *
 * Positions used to be fixed data (nothing in the game ever changed them).
 * Now the user can have a player work on one:
 *
 *   • A position he already lists as a secondary one ("accomplished") can
 *     become his PRIMARY in WEEKS_TO_PRIMARY weeks. His old primary becomes a
 *     secondary, so he keeps both.
 *   • A position he doesn't know yet can be LEARNED as a secondary one in
 *     WEEKS_TO_LEARN weeks, if his attributes aren't far off for that role
 *     (MAX_RATING_GAP points below his rating in his main position). To make
 *     it his primary he then retrains again.
 *   • Goalkeepers and outfield players can't swap.
 *
 * Why it matters: playing a secondary position costs 1 rating point and 7%
 * of every attribute in the match engine; a natural position costs nothing.
 * A player's primary position also decides which attributes he develops
 * (game/development), so a winger retrained as a striker starts growing
 * finishing instead of dribbling.
 *
 * The user has RETRAIN_SLOTS players retraining at once. Like scouting, the
 * change lands when the calendar passes its due date.
 */

export const RETRAIN_SLOTS = 2;
export const WEEKS_TO_PRIMARY = 4;
export const WEEKS_TO_LEARN = 12;
export const MAX_RATING_GAP = 3;
/** `secondaryPositions` can't hold more than this (the player schema's limit). */
const MAX_SECONDARY = 4;

export const RETRAIN_KINDS = ['primary', 'secondary'] as const;

export const RetrainingSchema = z.strictObject({
  playerId: PlayerIdSchema,
  position: PositionSchema,
  /** 'primary': a position he knows becomes his main one. 'secondary': he learns a new one. */
  kind: z.enum(RETRAIN_KINDS),
  started: IsoDateSchema,
  due: IsoDateSchema,
});

export const RetrainingStateSchema = z.array(RetrainingSchema).max(RETRAIN_SLOTS);

export type Retraining = z.infer<typeof RetrainingSchema>;
export type RetrainingState = z.infer<typeof RetrainingStateSchema>;

export const EMPTY_RETRAINING: RetrainingState = [];

const isKeeper = (position: Position) => position === 'GK';

const playerOf = (db: GameDatabase, id: PlayerId): Player | undefined => db.players.find((p) => p.id === id);
const clubOf = (db: GameDatabase, id: PlayerId): ClubId | null => db.contracts.find((c) => c.playerId === id)?.clubId ?? null;

const weeksFor = (kind: Retraining['kind']) => (kind === 'primary' ? WEEKS_TO_PRIMARY : WEEKS_TO_LEARN);

/** What retraining to `position` would be for this player: converting a known position or learning a new one. */
export const retrainKind = (player: Pick<Player, 'secondaryPositions'>, position: Position): Retraining['kind'] =>
  player.secondaryPositions.includes(position) ? 'primary' : 'secondary';

/** Why this player can't start on this position now, or null if he can. */
export function retrainProblem(state: RetrainingState, db: GameDatabase, userClubId: ClubId, playerId: PlayerId, position: Position): string | null {
  const player = playerOf(db, playerId);
  if (!player) return 'Unknown player.';
  if (clubOf(db, playerId) !== userClubId) return 'You can only retrain your own players.';
  if (position === player.primaryPosition) return 'That is already his main position.';
  if (isKeeper(position) !== isKeeper(player.primaryPosition)) return 'Goalkeepers and outfield players can’t swap roles.';
  if (state.some((r) => r.playerId === playerId)) return 'He is already retraining.';
  if (state.length >= RETRAIN_SLOTS) return `Only ${RETRAIN_SLOTS} players can retrain at a time.`;

  if (retrainKind(player, position) === 'secondary') {
    if (player.secondaryPositions.length >= MAX_SECONDARY) return `He already knows ${MAX_SECONDARY} other positions.`;
    const attributes = db.attributes.find((a) => a.playerId === playerId);
    if (attributes) {
      const now = positionRating(attributes, player.primaryPosition);
      const there = positionRating(attributes, position);
      if (there < now - MAX_RATING_GAP) {
        return `His attributes don’t suit it: he would rate ${Math.round(there)} there, against ${Math.round(now)} in his main position.`;
      }
    }
  }
  return null;
}

export function startRetraining(state: RetrainingState, db: GameDatabase, userClubId: ClubId, playerId: PlayerId, position: Position, date: string): RetrainingState {
  const problem = retrainProblem(state, db, userClubId, playerId, position);
  if (problem) throw new RangeError(problem);
  const kind = retrainKind(playerOf(db, playerId)!, position);
  return [...state, { playerId, position, kind, started: date, due: addDays(date, weeksFor(kind) * 7) }];
}

export function cancelRetraining(state: RetrainingState, playerId: PlayerId): RetrainingState {
  return state.filter((r) => r.playerId !== playerId);
}

/** The player after the lesson: a known position becomes primary (the old one is kept as a secondary), or a new one is learned. */
export function retrained(player: Player, position: Position, kind: Retraining['kind']): Player {
  if (kind === 'secondary') {
    return player.secondaryPositions.includes(position) || player.primaryPosition === position
      ? player
      : { ...player, secondaryPositions: [...player.secondaryPositions, position].slice(0, MAX_SECONDARY) };
  }
  return {
    ...player,
    primaryPosition: position,
    secondaryPositions: [player.primaryPosition, ...player.secondaryPositions.filter((p) => p !== position)].slice(0, MAX_SECONDARY),
  };
}

/**
 * Applies every retraining due on or before `date`. Players who left the
 * club or the game in the meantime are dropped without a message.
 */
export function deliverRetraining(
  state: RetrainingState,
  db: GameDatabase,
  userClubId: ClubId,
  date: string,
): { state: RetrainingState; db: GameDatabase; messages: NewMessage[] } {
  const due = state.filter((r) => r.due <= date);
  if (due.length === 0) return { state, db, messages: [] };
  const done = new Map<PlayerId, Player>();
  const messages: NewMessage[] = [];
  for (const r of due) {
    const player = playerOf(db, r.playerId);
    if (!player || clubOf(db, r.playerId) !== userClubId) continue;
    const next = retrained(player, r.position, r.kind);
    done.set(player.id, next);
    messages.push({
      date: r.due,
      category: 'squad',
      from: 'Head Coach',
      title: `${fullName(player)} retrained`,
      body:
        r.kind === 'primary'
          ? `${fullName(player)} has settled in as a ${POSITION_NAMES[r.position].toLowerCase()}: it is now his main position, and he can still cover ${POSITION_NAMES[player.primaryPosition].toLowerCase()}.`
          : `${fullName(player)} has learned to play as a ${POSITION_NAMES[r.position].toLowerCase()}. Retrain him again to make it his main position.`,
    });
  }
  return {
    state: state.filter((r) => r.due > date),
    db: done.size ? { ...db, players: db.players.map((p) => done.get(p.id) ?? p) } : db,
    messages,
  };
}

/** Drops retrainings of players the user no longer has (sold, released, retired). */
export function withoutDeparted(state: RetrainingState, db: GameDatabase, userClubId: ClubId): RetrainingState {
  return state.filter((r) => clubOf(db, r.playerId) === userClubId);
}

// --- Views ----------------------------------------------------------------------------

export type RetrainOption = {
  position: Position;
  label: string;
  kind: Retraining['kind'];
  weeks: number;
  /** His rating there before any familiarity penalty, rounded. */
  rating: number;
};

export type RetrainingView = {
  active: { position: Position; label: string; kind: Retraining['kind']; due: string } | null;
  /** Positions he can start on now (secondary ones first). Empty while another problem applies. */
  options: RetrainOption[];
  /** A reason nothing can start (slots full…), or null. */
  problem: string | null;
};

const ALL_POSITIONS = PositionSchema.options;

export function retrainingView(state: RetrainingState, db: GameDatabase, userClubId: ClubId, playerId: PlayerId): RetrainingView {
  const current = state.find((r) => r.playerId === playerId);
  const player = playerOf(db, playerId);
  const attributes = db.attributes.find((a) => a.playerId === playerId);
  const active = current ? { position: current.position, label: POSITION_NAMES[current.position], kind: current.kind, due: current.due } : null;
  if (!player || !attributes) return { active, options: [], problem: null };

  const options: RetrainOption[] = ALL_POSITIONS.flatMap((position) => {
    if (retrainProblem(state.filter((r) => r.playerId !== playerId), db, userClubId, playerId, position) !== null) return [];
    const kind = retrainKind(player, position);
    return [{ position, label: POSITION_NAMES[position], kind, weeks: weeksFor(kind), rating: Math.round(positionRating(attributes, position)) }];
  });
  options.sort((a, b) => (a.kind === b.kind ? b.rating - a.rating : a.kind === 'primary' ? -1 : 1));
  // Why the list is empty, when it is: the slots, not the player.
  const problem = !current && state.length >= RETRAIN_SLOTS ? `Only ${RETRAIN_SLOTS} players can retrain at a time.` : null;
  return { active, options: problem ? [] : options, problem };
}
