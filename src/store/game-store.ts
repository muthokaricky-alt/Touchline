import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
import { createDebouncedStorage } from '@/persistence/debounced-storage';
import { completeTransfer, type TransferRecord } from '@/game/transfers/complete';
import { personalTerms, playerContext, respondToBid, respondToTerms } from '@/game/transfers/negotiation';
import { checkSave, migrateSave, SAVE_KEY, SAVE_VERSION, worldChanges, type GameSave } from '@/persistence/save';
import { saveStatus } from '@/persistence/save-status';
import { platformStorage } from '@/persistence/storage';

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
 * Autosaved with Zustand's `persist` middleware (options at the bottom).
 *
 * The initial state is deterministic (fixed seeds): the static web export
 * renders it at build time and the browser must produce the same thing.
 * That's why the save is loaded only after mount (`skipHydration`).
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
  /** Every completed deal this career (including AI replacement signings). */
  transferHistory: TransferRecord[];
};

/** Terms agreed in the negotiation screen; re-checked by `signPlayer`. */
export type SigningOffer = { playerId: PlayerId; fee: number; weeklyWage: number; years: number };

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
  /** Throws away the career and starts again (the autosave is overwritten). */
  startNewGame: () => void;
  /**
   * Completes a signing. Re-runs the club's and player's decisions and all
   * deal checks, so the UI can never sign someone on terms they'd refuse.
   * Throws a RangeError explaining why if the deal isn't possible.
   */
  signPlayer: (offer: SigningOffer) => void;
};

/**
 * The generated world, built once. The live `database` in state is this plus
 * whatever transfers changed; a new game or a loaded save starts from here.
 */
let baseDatabase: GameDatabase | null = null;
export function getBaseDatabase(): GameDatabase {
  baseDatabase ??= buildFictionalDatabase(FICTIONAL_SEED);
  return baseDatabase;
}

/**
 * Autosave: writes are debounced (at most one per second) because persist
 * writes on every change and a late-season save is ~1 MB. `flushSave`
 * forces the pending write, e.g. when the app goes to the background.
 */
const debouncedSave = createDebouncedStorage(platformStorage, 1000, { onWrite: saveStatus.wrote, onError: saveStatus.failed });
export const flushSave = debouncedSave.flush;

/** What goes into the save file (see persistence/save.ts). */
function toSave(state: GameState): GameSave {
  return {
    worldSeed: FICTIONAL_SEED,
    userClubId: state.userClubId,
    currentDate: state.currentDate,
    lineup: state.lineup,
    tactics: state.tactics,
    season: state.season,
    ...worldChanges(state.database),
    transferHistory: state.transferHistory,
  };
}

/** A brand-new career, in the generated world (never a world changed by transfers). */
export function createInitialGameState(database: GameDatabase = getBaseDatabase()): GameState {
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
    transferHistory: [],
  };
}

type Store = GameState & GameActions;

export const useGameStore = create<Store>()(
  persist(
    (set, get) => ({
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
        const next = startNextSeason(database, season);
        // The calendar moves to 1 July: pre-season, with the summer transfer window open.
        set({ season: next, currentDate: `${next.startYear}-07-01`, lastMatch: null, lastMatchFixtureId: null });
      },
      clearMatch: () => set({ lastMatch: null, lastMatchFixtureId: null }),
      startNewGame: () => {
        saveStatus.dismissNotice();
        set(createInitialGameState());
      },
      signPlayer: ({ playerId, fee, weeklyWage, years }) => {
        const { database, userClubId, currentDate, transferHistory } = get();
        const ctx = playerContext(database, playerId, currentDate);
        const buyer = database.clubs.find((c) => c.id === userClubId);
        if (!ctx || !buyer) throw new RangeError('Unknown player or club.');
        if (ctx.club) {
          const bid = respondToBid(ctx, fee);
          if (bid.kind !== 'accept') throw new RangeError(bid.message);
        }
        const terms = respondToTerms(personalTerms(ctx, buyer), { weeklyWage, years });
        if (!terms.accepted) throw new RangeError(terms.reason);
        const outcome = completeTransfer(database, { playerId, buyerId: userClubId, fee, weeklyWage, years, date: currentDate });
        set({ database: outcome.db, transferHistory: [...transferHistory, ...outcome.records] });
      },
    }),
    {
      name: SAVE_KEY,
      version: SAVE_VERSION,
      storage: createJSONStorage(() => debouncedSave.storage),
      // Saved: the career plus what transfers changed (contracts, finances);
      // players and attributes are rebuilt from the world seed.
      partialize: (state) => toSave(state),
      // Loading is started by the app after mount (see persistence/use-hydration.ts),
      // so the first render always matches the static web HTML.
      skipHydration: true,
      // Older save formats are upgraded (v1 → v2); unknown ones become a marker `merge` rejects.
      migrate: (persisted, version) => migrateSave(persisted, version) as GameSave,
      // Validate before using anything from disk; on failure keep the new game and say why.
      merge: (persisted, current) => {
        // No save yet (first launch): persist still calls merge, with undefined. Not an error.
        if (persisted === undefined || persisted === null) return current;
        const check = checkSave(persisted, getBaseDatabase(), FICTIONAL_SEED);
        if (!check.ok) {
          saveStatus.notify(`${check.reason} A new game was started.`);
          return current;
        }
        saveStatus.loaded();
        const { worldSeed: _seed, contracts: _contracts, clubFinances: _finances, ...career } = check.save;
        return { ...current, ...career, database: check.database, lastMatch: null, lastMatchFixtureId: null };
      },
      // Unreadable JSON etc.
      onRehydrateStorage: () => (_state, error) => {
        if (error) saveStatus.notify('Your save could not be read. A new game was started.');
      },
    },
  ),
);
