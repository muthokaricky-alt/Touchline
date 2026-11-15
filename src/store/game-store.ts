import { create } from 'zustand';

import { buildFictionalDatabase, FICTIONAL_REFERENCE_DATE } from '@/data/fictional';
import type { ClubId, GameDatabase, PlayerId } from '@/data/schemas';
import { DEFAULT_FORMATION_ID, type FormationId } from '@/game/formations';
import {
  addSubstitute,
  assignToSlot,
  autoPickLineup,
  changeFormation,
  clearSlot,
  removeFromLineup,
  type Lineup,
} from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';

/**
 * The app's game state.
 *
 * Deliberately thin: it *holds* state and exposes actions, but every action
 * just calls a pure function from `src/game` and stores the result. All the
 * football logic stays testable without React or Zustand.
 *
 * Reading from components: select raw pieces (`s.database`, `s.lineup`)
 * and build view models with `useMemo`. Don't return a freshly built object
 * from the selector itself: Zustand compares selector results by reference,
 * so a new object on every call means "changed" on every render → infinite loop.
 *
 * State is in memory only for now (resets on reload). Saving arrives with
 * persistence (SQLite), at the latest in Milestone 10.
 */

/** No career setup yet, so everyone manages Greywater Town (reputation 13, mid-table). */
export const DEFAULT_USER_CLUB_ID: ClubId = 'club_greywater_town';

export type GameState = {
  database: GameDatabase;
  userClubId: ClubId;
  /** Current in-game date (ISO). Fixed until the calendar exists (Milestone 6). */
  currentDate: string;
  lineup: Lineup;
};

export type GameActions = {
  changeFormation: (formationId: FormationId) => void;
  assignToSlot: (slotId: string, playerId: PlayerId) => void;
  clearSlot: (slotId: string) => void;
  addSubstitute: (playerId: PlayerId) => void;
  removeFromLineup: (playerId: PlayerId) => void;
  autoPick: () => void;
};

export function createInitialGameState(): GameState {
  const database = buildFictionalDatabase();
  const userClubId = DEFAULT_USER_CLUB_ID;
  return {
    database,
    userClubId,
    currentDate: FICTIONAL_REFERENCE_DATE,
    lineup: autoPickLineup(selectSquadCandidates(database, userClubId), DEFAULT_FORMATION_ID),
  };
}

export const useGameStore = create<GameState & GameActions>()((set) => ({
  ...createInitialGameState(),

  changeFormation: (formationId) =>
    set((s) => ({ lineup: changeFormation(s.lineup, formationId, selectSquadCandidates(s.database, s.userClubId)) })),
  assignToSlot: (slotId, playerId) => set((s) => ({ lineup: assignToSlot(s.lineup, slotId, playerId) })),
  clearSlot: (slotId) => set((s) => ({ lineup: clearSlot(s.lineup, slotId) })),
  addSubstitute: (playerId) => set((s) => ({ lineup: addSubstitute(s.lineup, playerId) })),
  removeFromLineup: (playerId) => set((s) => ({ lineup: removeFromLineup(s.lineup, playerId) })),
  autoPick: () =>
    set((s) => ({ lineup: autoPickLineup(selectSquadCandidates(s.database, s.userClubId), s.lineup.formationId) })),
}));
