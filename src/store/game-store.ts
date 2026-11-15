import { create } from 'zustand';

import { buildFictionalDatabase, FICTIONAL_REFERENCE_DATE, FICTIONAL_SEED } from '@/data/fictional';
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
import { simulateMatch } from '@/engine/simulate';
import type { MatchResult } from '@/engine/types';
import { newMatchSeed, prepareFriendly, type MatchVenue } from '@/game/match/friendly';
import type { Season } from '@/game/season/season';
import {
  advanceToUserFixture,
  createSeason,
  isSeasonComplete,
  nextFixtureFor,
  playRemaining,
  startNextSeason,
} from '@/game/season/season-flow';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { PLAYING_STYLES, type PlayingStyleId } from '@/game/tactics/presets';
import { DEFAULT_TACTICS, setInstruction, type Instruction, type Tactics } from '@/game/tactics/tactics';

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
 * State is in memory only for now (resets on reload). Autosave is the next
 * step after Milestone 6.
 *
 * The initial state is deterministic (fixed seeds): the static web export
 * renders it at build time and the browser must produce the same thing.
 */

/** No career setup yet, so everyone manages Greywater Town (reputation 13, mid-table). */
export const DEFAULT_USER_CLUB_ID: ClubId = 'club_greywater_town';

export type GameState = {
  database: GameDatabase;
  userClubId: ClubId;
  /** Current in-game date (ISO): pre-season until the first match, then the last matchday played. */
  currentDate: string;
  lineup: Lineup;
  tactics: Tactics;
  /** The league season in progress (fixtures + compact results). */
  season: Season;
  /** Full result of the most recent match (league or friendly), for the match centre. */
  lastMatch: MatchResult | null;
  /** Fixture id when `lastMatch` was a league game; null for friendlies. */
  lastMatchFixtureId: string | null;
};

export type GameActions = {
  changeFormation: (formationId: FormationId) => void;
  assignToSlot: (slotId: string, playerId: PlayerId) => void;
  clearSlot: (slotId: string) => void;
  addSubstitute: (playerId: PlayerId) => void;
  removeFromLineup: (playerId: PlayerId) => void;
  autoPick: () => void;
  setInstruction: <K extends Instruction>(key: K, value: Tactics[K]) => void;
  applyPlayingStyle: (styleId: PlayingStyleId) => void;
  /** Simulates a friendly with the current lineup and tactics. `seed` is for tests; normally from the clock. */
  playFriendly: (opponentId: ClubId, venue: MatchVenue, seed?: number) => MatchResult;
  /** Plays every date up to and including the user's next fixture (league or cup). */
  playNextFixture: () => MatchResult;
  /** Once the user has no fixtures left: plays the rest of the season (e.g. a cup final between other clubs). */
  finishSeason: () => void;
  /** Only once the current season is complete. Applies promotion/relegation. */
  startNextSeason: () => void;
  clearMatch: () => void;
};

export function createInitialGameState(): GameState {
  const database = buildFictionalDatabase();
  const userClubId = DEFAULT_USER_CLUB_ID;
  return {
    database,
    userClubId,
    currentDate: FICTIONAL_REFERENCE_DATE,
    lineup: autoPickLineup(selectSquadCandidates(database, userClubId), DEFAULT_FORMATION_ID),
    tactics: DEFAULT_TACTICS,
    season: createSeason(database, 2026, FICTIONAL_SEED),
    lastMatch: null,
    lastMatchFixtureId: null,
  };
}

export const useGameStore = create<GameState & GameActions>()((set, get) => ({
  ...createInitialGameState(),

  changeFormation: (formationId) =>
    set((s) => ({ lineup: changeFormation(s.lineup, formationId, selectSquadCandidates(s.database, s.userClubId)) })),
  assignToSlot: (slotId, playerId) => set((s) => ({ lineup: assignToSlot(s.lineup, slotId, playerId) })),
  clearSlot: (slotId) => set((s) => ({ lineup: clearSlot(s.lineup, slotId) })),
  addSubstitute: (playerId) => set((s) => ({ lineup: addSubstitute(s.lineup, playerId) })),
  removeFromLineup: (playerId) => set((s) => ({ lineup: removeFromLineup(s.lineup, playerId) })),
  autoPick: () =>
    set((s) => ({ lineup: autoPickLineup(selectSquadCandidates(s.database, s.userClubId), s.lineup.formationId) })),
  setInstruction: (key, value) => set((s) => ({ tactics: setInstruction(s.tactics, key, value) })),
  applyPlayingStyle: (styleId) => set({ tactics: PLAYING_STYLES[styleId].tactics }),
  playFriendly: (opponentId, venue, seed = newMatchSeed()) => {
    const { database, userClubId, lineup, tactics } = get();
    const result = simulateMatch(prepareFriendly({ db: database, userClubId, lineup, tactics, opponentId, venue, seed }));
    set({ lastMatch: result, lastMatchFixtureId: null });
    return result;
  },
  playNextFixture: () => {
    const { database, userClubId, lineup, tactics, season } = get();
    const played = advanceToUserFixture(database, season, { clubId: userClubId, lineup, tactics });
    set({ season: played.season, lastMatch: played.result, lastMatchFixtureId: played.fixture.id, currentDate: played.fixture.date });
    return played.result;
  },
  finishSeason: () => {
    const { database, userClubId, season } = get();
    if (nextFixtureFor(season, userClubId)) throw new RangeError('You still have fixtures to play');
    const finished = playRemaining(database, season);
    const lastDate = finished.fixtures.reduce((latest, f) => (f.date > latest ? f.date : latest), get().currentDate);
    set({ season: finished, currentDate: lastDate });
  },
  startNextSeason: () => {
    const { database, season } = get();
    if (!isSeasonComplete(season)) throw new RangeError('The current season is still in progress');
    set({ season: startNextSeason(database, season), lastMatch: null, lastMatchFixtureId: null });
  },
  clearMatch: () => set({ lastMatch: null, lastMatchFixtureId: null }),
}));
