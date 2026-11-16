import { z } from 'zod';

import { IsoDateSchema, PlayerIdSchema, type ClubId, type GameDatabase, type PlayerId } from '@/data/schemas';
import { addDays, ageOn } from '@/utils/date';
import { formatDate } from '@/utils/format';

import { formatPotentialRange, potentialOf, potentialRange, type Knowledge } from '../development/potential';
import type { NewMessage } from '../inbox/inbox';
import { fullName } from '../squad/squad-selectors';
import { playerAbility } from '../transfers/valuation';

/**
 * Scouting: how well the user knows other clubs' players' potential.
 *
 * Knowledge per player: 0 = not scouted (a wide, slightly off range),
 * 1 = scouted (narrow range), 2 = full report (exact). Your own players are
 * always at least 1: your coaches see them every day.
 *
 * The user sends a scout (up to SCOUTS at once, free); the report arrives
 * REPORT_DAYS later, when the calendar passes that date, and raises the
 * player's knowledge by one level. Nothing ticks daily: due reports are
 * delivered whenever the store moves the calendar, like contract warnings.
 *
 * Only the USER's knowledge is modelled. AI clubs (and market values) work
 * with true potential, as before.
 */

export const SCOUTS = 3;
export const REPORT_DAYS = 14;

export const ScoutingAssignmentSchema = z.strictObject({
  playerId: PlayerIdSchema,
  started: IsoDateSchema,
  due: IsoDateSchema,
});

export const ScoutingStateSchema = z.strictObject({
  assignments: z.array(ScoutingAssignmentSchema).max(SCOUTS),
  /** Only players the user has scouted (level 1 or 2). */
  knowledge: z.record(PlayerIdSchema, z.union([z.literal(1), z.literal(2)])),
});

export type ScoutingAssignment = z.infer<typeof ScoutingAssignmentSchema>;
export type ScoutingState = z.infer<typeof ScoutingStateSchema>;

export const EMPTY_SCOUTING: ScoutingState = { assignments: [], knowledge: {} };

const clubOf = (db: GameDatabase, playerId: PlayerId): ClubId | null => db.contracts.find((c) => c.playerId === playerId)?.clubId ?? null;

/** What the user knows about a player's potential. */
export function knowledgeOf(state: ScoutingState, db: GameDatabase, userClubId: ClubId, playerId: PlayerId): Knowledge {
  const scouted = state.knowledge[playerId] ?? 0;
  return clubOf(db, playerId) === userClubId ? (Math.max(1, scouted) as Knowledge) : scouted;
}

/** Why the user can't send a scout to this player right now, or null if they can. */
export function scoutingProblem(state: ScoutingState, db: GameDatabase, userClubId: ClubId, playerId: PlayerId): string | null {
  if (!db.players.some((p) => p.id === playerId)) return 'Unknown player.';
  if (clubOf(db, playerId) === userClubId) return 'He’s one of your players: your coaches already know him.';
  const current = state.assignments.find((a) => a.playerId === playerId);
  if (current) return `A scout is already watching him (report due ${formatDate(current.due)}).`;
  if (knowledgeOf(state, db, userClubId, playerId) >= 2) return 'You already have a full report on him.';
  if (state.assignments.length >= SCOUTS) return `All ${SCOUTS} scouts are busy.`;
  return null;
}

export function startAssignment(state: ScoutingState, db: GameDatabase, userClubId: ClubId, playerId: PlayerId, date: string): ScoutingState {
  const problem = scoutingProblem(state, db, userClubId, playerId);
  if (problem) throw new RangeError(problem);
  return { ...state, assignments: [...state.assignments, { playerId, started: date, due: addDays(date, REPORT_DAYS) }] };
}

export function cancelAssignment(state: ScoutingState, playerId: PlayerId): ScoutingState {
  return { ...state, assignments: state.assignments.filter((a) => a.playerId !== playerId) };
}

/** The Chief Scout's verdict on a range: plain words a manager would use. */
function verdict(low: number, high: number, ability: number): string {
  const mid = (low + high) / 2;
  const growth = mid - ability;
  if (mid >= 17) return growth >= 2 ? 'A potential star. Worth serious money.' : 'A top-class player.';
  if (growth >= 3) return 'Plenty of room to grow. One for the future.';
  if (growth >= 1) return 'Should still improve a little.';
  return 'What you see is what you get: he’s close to his ceiling.';
}

/**
 * Delivers every report due on or before `date`: knowledge goes up a level
 * and the Chief Scout writes. Players who left football in the meantime are
 * dropped without a report.
 */
export function deliverReports(
  state: ScoutingState,
  db: GameDatabase,
  userClubId: ClubId,
  date: string,
): { state: ScoutingState; messages: NewMessage[] } {
  const due = state.assignments.filter((a) => a.due <= date);
  if (due.length === 0) return { state, messages: [] };
  const knowledge = { ...state.knowledge };
  const messages: NewMessage[] = [];
  for (const a of due) {
    const player = db.players.find((p) => p.id === a.playerId);
    const attributes = db.attributes.find((x) => x.playerId === a.playerId);
    if (!player || !attributes) continue;
    const level = Math.min(2, (knowledge[a.playerId] ?? 0) + 1) as 1 | 2;
    knowledge[a.playerId] = level;
    const ability = playerAbility(player, attributes);
    const range = potentialRange(player.id, potentialOf(player, attributes), ability, Math.max(level, knowledgeOf(state, db, userClubId, player.id)) as Knowledge);
    const club = db.clubs.find((c) => c.id === clubOf(db, player.id));
    messages.push({
      date: a.due,
      category: 'scouting',
      from: 'Chief Scout',
      title: `${level === 2 ? 'Full report' : 'Scouting report'}: ${fullName(player)}`,
      body:
        `${fullName(player)} (${player.primaryPosition}, ${ageOn(player.dateOfBirth, a.due)}, ${club ? club.name : 'free agent'}). ` +
        `Current rating ${Math.round(ability)}, potential ${formatPotentialRange(range)}. ${verdict(range.low, range.high, ability)}` +
        (level === 1 ? ' Send a scout again for a full report.' : ''),
    });
  }
  return { state: { assignments: state.assignments.filter((a) => a.due > date), knowledge }, messages };
}

/** Removes players who no longer exist (retired, left football). */
export function withoutMissingPlayers(state: ScoutingState, db: GameDatabase): ScoutingState {
  const present = new Set(db.players.map((p) => p.id));
  return {
    assignments: state.assignments.filter((a) => present.has(a.playerId)),
    knowledge: Object.fromEntries(Object.entries(state.knowledge).filter(([id]) => present.has(id))),
  };
}

// --- Views ------------------------------------------------------------------------

export const KNOWLEDGE_LABELS: Record<Knowledge, string> = { 0: 'Not scouted', 1: 'Scouted', 2: 'Full report' };

export type ScoutingStatusView = {
  knowledge: Knowledge;
  label: string;
  /** Report due date when a scout is watching him. */
  due: string | null;
  /** Null when "Scout player" is possible. */
  problem: string | null;
};

export function scoutingStatus(state: ScoutingState, db: GameDatabase, userClubId: ClubId, playerId: PlayerId): ScoutingStatusView {
  const knowledge = knowledgeOf(state, db, userClubId, playerId);
  return {
    knowledge,
    label: KNOWLEDGE_LABELS[knowledge],
    due: state.assignments.find((a) => a.playerId === playerId)?.due ?? null,
    problem: scoutingProblem(state, db, userClubId, playerId),
  };
}

export type AssignmentView = { playerId: PlayerId; name: string; clubName: string; due: string };

export function assignmentViews(state: ScoutingState, db: GameDatabase): AssignmentView[] {
  return state.assignments.map((a) => {
    const player = db.players.find((p) => p.id === a.playerId);
    const club = db.clubs.find((c) => c.id === clubOf(db, a.playerId));
    return { playerId: a.playerId, name: player ? fullName(player) : a.playerId, clubName: club?.name ?? 'Free agent', due: a.due };
  });
}
