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
import { adjustMorale, conditionOn, emptyConditions, isInjured, type ConditionState } from '@/game/condition/condition';
import { injuryMessages, withoutUnavailable } from '@/game/condition/squad-care';
import { disciplineMessages, suspendedFor } from '@/game/discipline/suspensions';
import { DEFAULT_TRAINING, type Training } from '@/game/development/development';
import { developmentReport, developThrough } from '@/game/development/monthly';
import { assignPotential } from '@/game/development/potential';
import { worldFor } from '@/game/world/renewal';
import { afterUserMatchday, closeSeason } from '@/game/career/career-flow';
import { ManagerSchema, newManager, takeNewJob, type Manager } from '@/game/career/manager';
import { admitIntakeToCareer, retireFromCareer } from '@/game/world/renewal-career';
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
import { addMessages, markAllRead, markRead, type InboxMessage } from '@/game/inbox/inbox';
import {
  acceptOffer,
  afterCalendarMove,
  rejectOffer,
  releaseFromSquad,
  renewPlayer,
  seasonRollover,
  toggleListed,
  type TransferCareer,
} from '@/game/transfers/career';
import { completeTransfer, type TransferRecord } from '@/game/transfers/complete';
import type { TransferOffer } from '@/game/transfers/offers';
import { formatCompactCurrency } from '@/utils/format';
import { personalTerms, playerContext, respondToBid, respondToTerms } from '@/game/transfers/negotiation';
import { checkSave, migrateSave, SAVE_VERSION, worldChanges, type GameSave, type SaveCheck } from '@/persistence/save';
import { createSlotStorage, slotKey } from '@/persistence/slot-storage';
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
  /** The user's players available for sale. */
  transferListed: PlayerId[];
  /** AI bids for the user's players, waiting for an answer. */
  offers: TransferOffer[];
  inbox: InboxMessage[];
  /**
   * Fitness, morale and injuries of every player, as of `condition.date`
   * (the last matchday). Read it through `conditionOn(condition, currentDate)`.
   */
  condition: ConditionState;
  /** The user's training (AI clubs always train with DEFAULT_TRAINING). */
  training: Training;
  /**
   * The manager's career. Null until a career has been started (first launch,
   * or after "Start new game"): the app then shows the new-career screen.
   */
  manager: Manager | null;
};

/** A club id no club has: used as "the user" in a summer when he's changing clubs, so every club gets the AI's treatment. */
const VACANT_CLUB = 'club_vacant';

/**
 * Condition as it will be at the user's next kick-off (today if there's no
 * fixture left): team selection is about who can play THAT match. A 4-day
 * knock picked up on Saturday doesn't rule a player out of next Saturday.
 */
export function conditionAtKickOff(s: Pick<GameState, 'condition' | 'currentDate' | 'season' | 'userClubId'>): ConditionState {
  const next = nextFixtureFor(s.season, s.userClubId);
  return conditionOn(s.condition, next && next.date > s.currentDate ? next.date : s.currentDate);
}

/** Players banned from the user's next fixture (nobody when there's none left). */
export function suspendedAtKickOff(s: Pick<GameState, 'season' | 'userClubId'>): ReadonlySet<PlayerId> {
  return suspendedFor(s.season, nextFixtureFor(s.season, s.userClubId));
}

/** The user's players who can play the next fixture: not injured then, not suspended for it. */
function availableAtKickOff(s: Pick<GameState, 'database' | 'condition' | 'currentDate' | 'season' | 'userClubId'>) {
  const atKickOff = conditionAtKickOff(s);
  const suspended = suspendedAtKickOff(s);
  return selectSquadCandidates(s.database, s.userClubId).filter((c) => !isInjured(atKickOff, c.player.id) && !suspended.has(c.player.id));
}

/** Morale effects of the user's decisions. */
const LISTED_MORALE = -10;
const UNLISTED_MORALE = 5;
const RENEWED_MORALE = 5;

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
  /** Only once the current season is complete. `newClubId`: accept that club's job offer. */
  startNextSeason: (newClubId?: ClubId | null) => void;
  /** Begins a career: manager name and club (any of the 40). Replaces the current game. */
  startCareer: (name: string, clubId: ClubId) => void;
  /** After a mid-season sacking: take one of the clubs that offered a job. */
  chooseNewJob: (clubId: ClubId) => void;
  clearMatch: () => void;
  /** Throws away the career and starts again (the autosave is overwritten). */
  startNewGame: () => void;
  /**
   * Completes a signing. Re-runs the club's and player's decisions and all
   * deal checks, so the UI can never sign someone on terms they'd refuse.
   * Throws a RangeError explaining why if the deal isn't possible.
   */
  signPlayer: (offer: SigningOffer) => void;
  toggleTransferListed: (playerId: PlayerId) => void;
  acceptOffer: (offerId: string) => void;
  rejectOffer: (offerId: string) => void;
  /** Terminates a contract, paying half the remaining wages. */
  releasePlayer: (playerId: PlayerId) => void;
  /** New terms for one of the user's players (re-checked against his demands). */
  renewContract: (offer: { playerId: PlayerId; weeklyWage: number; years: number }) => void;
  markMessageRead: (id: string) => void;
  markAllMessagesRead: () => void;
  setTraining: (change: Partial<Training>) => void;
};

/** The transfer slice of the state, as the pure `career` functions expect it. */
function transferCareer(s: GameState): TransferCareer {
  return {
    db: s.database,
    userClubId: s.userClubId,
    date: s.currentDate,
    lineup: s.lineup,
    transferListed: s.transferListed,
    offers: s.offers,
    inbox: s.inbox,
    transferHistory: s.transferHistory,
  };
}

/** …and back into state fields. */
function fromCareer(c: TransferCareer): Partial<GameState> {
  return {
    database: c.db,
    currentDate: c.date,
    lineup: c.lineup,
    transferListed: c.transferListed,
    offers: c.offers,
    inbox: c.inbox,
    transferHistory: c.transferHistory,
  };
}

/**
 * The generated world (with every player's potential), built once. The live
 * `database` in state is this plus whatever transfers and development
 * changed; a new game or a loaded save starts from here.
 */
let baseDatabase: GameDatabase | null = null;
export function getBaseDatabase(): GameDatabase {
  baseDatabase ??= assignPotential(buildFictionalDatabase(FICTIONAL_SEED), FICTIONAL_SEED, FICTIONAL_REFERENCE_DATE);
  return baseDatabase;
}

/** The generated world for a season: the base plus every youth intake so far (saves are diffs against this). */
export const generatedWorld = (startYear: number) => worldFor(getBaseDatabase(), FICTIONAL_SEED, startYear);

/**
 * The monthly step (development, training knocks, the coaching report) for a
 * move of the calendar from `from` to `to`. A no-op unless a 1st of the month
 * is crossed.
 */
function monthlyStep(s: GameState, from: string, to: string, season: Season, condition: ConditionState) {
  const outcome = developThrough({
    db: s.database,
    from,
    to,
    season,
    condition,
    userClubId: s.userClubId,
    userTraining: s.training,
    seed: FICTIONAL_SEED,
  });
  const report = developmentReport(outcome.db, s.userClubId, outcome, to);
  const messages = [
    ...(report ? [report] : []),
    ...injuryMessages(outcome.db, s.userClubId, outcome.trainingInjuries, to, 'training'),
  ];
  return { database: outcome.db, condition: outcome.condition, messages };
}

/**
 * Autosave: writes are debounced (at most one per second) because persist
 * writes on every change and a late-season save is ~1 MB. `flushSave`
 * forces the pending write, e.g. when the app goes to the background.
 */
/**
 * Storage chain: persist → debounced (≤ 1 write a second) → slots
 * (compression, backup, slot index) → the platform's storage.
 */
export const slotStorage = createSlotStorage(platformStorage);
const debouncedSave = createDebouncedStorage(slotStorage, 1000, {
  onWrite: () => saveStatus.wrote(slotStorage.index()),
  onError: saveStatus.failed,
});
export const flushSave = debouncedSave.flush;

/**
 * Validates a persisted `{ state, version }` from anywhere (the slot, its
 * backup, an imported file): upgrade old formats, then the full save check.
 */
export function validatePersisted(raw: unknown): SaveCheck {
  if (typeof raw !== 'object' || raw === null || !('state' in raw)) return { ok: false, reason: "This isn't a Touchline save." };
  const { state, version } = raw as { state: unknown; version?: unknown };
  const upgraded = typeof version === 'number' && version !== SAVE_VERSION ? migrateSave(state, version) : state;
  return checkSave(upgraded, generatedWorld, FICTIONAL_SEED);
}

/** Game state from a save that passed `checkSave` (what the save doesn't hold comes from `current`). */
function stateFromSave<T extends GameState>(check: Extract<SaveCheck, { ok: true }>, current: T): T {
  const { worldSeed: _seed, contracts: _contracts, clubFinances: _finances, attributeChanges: _attributes, retired: _retired, ...career } = check.save;
  return { ...current, ...career, database: check.database, lastMatch: null, lastMatchFixtureId: null };
}

/** What goes into the save file (see persistence/save.ts). */
function toSave(state: GameState): GameSave {
  return {
    worldSeed: FICTIONAL_SEED,
    userClubId: state.userClubId,
    currentDate: state.currentDate,
    lineup: state.lineup,
    tactics: state.tactics,
    season: state.season,
    ...worldChanges(state.database, generatedWorld(state.season.startYear)),
    transferHistory: state.transferHistory,
    transferListed: state.transferListed,
    offers: state.offers,
    inbox: state.inbox,
    condition: state.condition,
    training: state.training,
    manager: state.manager,
  };
}

/**
 * The user takes over `clubId` (a new career, a new job): auto-picked lineup
 * of the players fit at the next kick-off, default tactics and training,
 * and nothing left over from the old club's transfer business.
 */
function switchClub(s: Pick<GameState, 'database' | 'condition' | 'currentDate' | 'season'>, clubId: ClubId): Partial<GameState> {
  return {
    userClubId: clubId,
    lineup: autoPickLineup(availableAtKickOff({ ...s, userClubId: clubId }), DEFAULT_FORMATION_ID),
    tactics: DEFAULT_TACTICS,
    training: DEFAULT_TRAINING,
    transferListed: [],
    offers: [],
  };
}

/** A brand-new game, in the generated world (never a world changed by transfers). No manager until a career starts. */
export function createInitialGameState(database: GameDatabase = getBaseDatabase(), clubId: ClubId = DEFAULT_USER_CLUB_ID): GameState {
  const userClubId = clubId;
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
    transferListed: [],
    offers: [],
    inbox: [],
    condition: emptyConditions(FICTIONAL_REFERENCE_DATE),
    training: DEFAULT_TRAINING,
    manager: null,
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
      autoPick: () => set((s) => ({ lineup: autoPickLineup(availableAtKickOff(s), s.lineup.formationId) })),
      setInstruction: (key, value) => set((s) => ({ tactics: setInstruction(s.tactics, key, value) })),
      applyPlayingStyle: (styleId) => set({ tactics: PLAYING_STYLES[styleId].tactics }),
      playFriendly: (opponentId, venue, seed = newMatchSeed()) => {
        const { database, userClubId, lineup, tactics, condition, currentDate } = get();
        // Friendlies use today's condition but don't change it (no injuries or fatigue carried over).
        const today = conditionOn(condition, currentDate);
        const result = simulateMatch(prepareFriendly({ db: database, userClubId, lineup, tactics, opponentId, venue, seed, condition: today }));
        set({ lastMatch: result, lastMatchFixtureId: null });
        return result;
      },
      playNextFixture: () => {
        const state = get();
        if (state.manager?.sackedOffers) throw new RangeError('Choose your next club first.');
        const { database, userClubId, lineup, tactics, season } = state;
        const played = advanceToUserFixture(database, season, { clubId: userClubId, lineup, tactics }, state.condition);
        const date = played.fixture.date;
        // A new month: players develop, some pick up training knocks.
        const monthly = monthlyStep(state, state.currentDate, date, played.season, played.condition);
        // The calendar moved: offers expire / arrive, contract warnings.
        const career = afterCalendarMove({ ...transferCareer(state), db: monthly.database, date }, state.currentDate, season.seed);
        // The board reacts to the league results (warning, or the sack with job offers).
        const board = state.manager ? afterUserMatchday(career.db, season, played.season, userClubId, state.manager, date) : null;
        const playedFixture = played.season.fixtures.find((f) => f.id === played.fixture.id) ?? played.fixture;
        set({
          ...fromCareer(career),
          manager: board?.manager ?? state.manager,
          // Players still injured at the next kick-off, or banned from it, leave the lineup;
          // the Head of Medical reports every injury, the assistant every ban.
          lineup: withoutUnavailable(
            career.db,
            userClubId,
            career.lineup,
            conditionAtKickOff({ condition: monthly.condition, currentDate: date, season: played.season, userClubId }),
            suspendedAtKickOff({ season: played.season, userClubId }),
          ),
          inbox: addMessages(career.inbox, [
            ...injuryMessages(career.db, userClubId, played.injuries, date),
            ...disciplineMessages(career.db, played.season, playedFixture, userClubId, date),
            ...monthly.messages,
            ...(board?.messages ?? []),
          ]),
          condition: monthly.condition,
          season: played.season,
          lastMatch: played.result,
          lastMatchFixtureId: played.fixture.id,
        });
        return played.result;
      },
      finishSeason: () => {
        const state = get();
        if (nextFixtureFor(state.season, state.userClubId)) throw new RangeError('You still have fixtures to play');
        const finished = playRemaining(state.database, state.season, state.condition);
        const lastDate = finished.season.fixtures.reduce((latest, f) => (f.date > latest ? f.date : latest), state.currentDate);
        const monthly = monthlyStep(state, state.currentDate, lastDate, finished.season, finished.condition ?? state.condition);
        const career = afterCalendarMove({ ...transferCareer(state), db: monthly.database, date: lastDate }, state.currentDate, state.season.seed);
        set({
          ...fromCareer(career),
          inbox: addMessages(career.inbox, monthly.messages),
          season: finished.season,
          condition: monthly.condition,
        });
      },
      startNextSeason: (newClubId = null) => {
        const state = get();
        if (!isSeasonComplete(state.season)) throw new RangeError('The current season is still in progress');
        // The board's review first: reputation, history, and the user's club for next season.
        const seasonStartDate = `${state.season.startYear + 1}-07-01`;
        const closed = state.manager ? closeSeason(state.database, state.season, state.userClubId, state.manager, newClubId, seasonStartDate) : null;
        const moving = closed !== null && closed.clubId !== state.userClubId;
        // In a summer he changes clubs, every club gets the AI's treatment (renewals, intake): they decided before he arrived.
        const summerUser = moving ? VACANT_CLUB : state.userClubId;
        // 1 July: contracts expire first (promotion/relegation doesn't depend on them), then the new
        // fixture list; the summer window is open, so offers may arrive straight away.
        const seasonStart = `${state.season.startYear + 1}-07-01`;
        // June and July's development happens first (with the finished season's playing time).
        const monthly = monthlyStep(state, state.currentDate, seasonStart, state.season, state.condition);
        const year = state.season.startYear + 1;
        // 30 June: retirements. 1 July: contracts expire (AI clubs refill squads), then the academy intake.
        const retired = retireFromCareer(
          {
            ...transferCareer(state),
            userClubId: summerUser,
            db: monthly.database,
            inbox: addMessages(state.inbox, [...monthly.messages, ...(closed?.messages ?? [])]),
          },
          FICTIONAL_SEED,
          year,
        ).career;
        const rolled = admitIntakeToCareer(seasonRollover(retired, seasonStart), FICTIONAL_SEED, year);
        const next = startNextSeason(rolled.db, state.season);
        const career = afterCalendarMove(rolled, state.currentDate, next.seed);
        // Over the summer most players recover and heal; anyone still injured at the first kick-off stays out of the lineup.
        // Retired players' records are dropped (the save only keeps condition for players who exist).
        const recovered = conditionOn(monthly.condition, seasonStart);
        const stillHere = new Set(rolled.db.players.map((p) => p.id));
        const condition = { ...recovered, players: Object.fromEntries(Object.entries(recovered.players).filter(([id]) => stillHere.has(id))) };
        const after = { database: career.db, condition, currentDate: seasonStart, season: next };
        set({
          ...fromCareer(career),
          ...(moving
            ? switchClub(after, closed!.clubId)
            : {
                // A new season: bans have lapsed.
                lineup: withoutUnavailable(
                  career.db,
                  state.userClubId,
                  career.lineup,
                  conditionAtKickOff({ condition, currentDate: seasonStart, season: next, userClubId: state.userClubId }),
                ),
              }),
          manager: closed?.manager ?? state.manager,
          condition,
          season: next,
          lastMatch: null,
          lastMatchFixtureId: null,
        });
      },
      clearMatch: () => set({ lastMatch: null, lastMatchFixtureId: null }),
      startNewGame: () => {
        saveStatus.dismissNotice();
        set(createInitialGameState());
      },
      startCareer: (name, clubId) => {
        const base = getBaseDatabase();
        const club = base.clubs.find((c) => c.id === clubId);
        if (!club) throw new RangeError('Unknown club.');
        const manager = newManager(name, club.reputation);
        const valid = ManagerSchema.safeParse(manager);
        if (!valid.success) throw new RangeError('Enter a name of 1–30 characters.');
        saveStatus.dismissNotice();
        set({ ...createInitialGameState(base, clubId), manager: valid.data });
      },
      chooseNewJob: (clubId) =>
        set((s) => {
          if (!s.manager?.sackedOffers?.includes(clubId)) throw new RangeError("That club hasn't offered you a job.");
          const name = s.database.clubs.find((c) => c.id === clubId)?.name ?? clubId;
          return {
            ...switchClub(s, clubId),
            manager: takeNewJob(s.manager),
            inbox: addMessages(s.inbox, [
              { date: s.currentDate, category: 'squad', from: 'Chairman', title: `Welcome to ${name}`, body: 'The board is looking forward to working with you. Good luck.' },
            ]),
          };
        }),
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
        const name = `${ctx.player.firstName} ${ctx.player.lastName}`;
        set({
          database: outcome.db,
          transferHistory: [...transferHistory, ...outcome.records],
          inbox: addMessages(get().inbox, [
            {
              date: currentDate,
              category: 'transfer',
              from: 'Director of Football',
              title: `${name} signs ${ctx.club ? `from ${ctx.club.name}` : 'on a free transfer'}`,
              body: `${years}-year contract.${fee ? ` Fee ${formatCompactCurrency(fee)}.` : ''}`,
            },
          ]),
        });
      },
      toggleTransferListed: (playerId) =>
        set((s) => {
          const listing = !s.transferListed.includes(playerId);
          const career = toggleListed(transferCareer(s), playerId);
          // Being put up for sale hurts; being taken off the list helps a little.
          const condition = adjustMorale(conditionOn(s.condition, s.currentDate), playerId, listing ? LISTED_MORALE : UNLISTED_MORALE);
          return { ...fromCareer(career), condition };
        }),
      acceptOffer: (offerId) => set((s) => fromCareer(acceptOffer(transferCareer(s), offerId))),
      rejectOffer: (offerId) => set((s) => fromCareer(rejectOffer(transferCareer(s), offerId))),
      releasePlayer: (playerId) => set((s) => fromCareer(releaseFromSquad(transferCareer(s), playerId))),
      renewContract: (offer) =>
        set((s) => ({
          ...fromCareer(renewPlayer(transferCareer(s), offer)),
          condition: adjustMorale(conditionOn(s.condition, s.currentDate), offer.playerId, RENEWED_MORALE),
        })),
      markMessageRead: (id) => set((s) => ({ inbox: markRead(s.inbox, id) })),
      markAllMessagesRead: () => set((s) => ({ inbox: markAllRead(s.inbox) })),
      setTraining: (change) => set((s) => ({ training: { ...s.training, ...change } })),
    }),
    {
      // The active slot's key; `openActiveSlot` points it at the remembered slot before loading.
      name: slotKey(1),
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
        const fresh = { ...current, ...createInitialGameState() };
        // Empty slot (first launch, or a new slot): persist still calls merge, with undefined. Not an error.
        if (persisted === undefined || persisted === null) return fresh;
        const check = checkSave(persisted, generatedWorld, FICTIONAL_SEED);
        if (check.ok) {
          saveStatus.loaded();
          return stateFromSave(check, current);
        }
        // The latest save is damaged: try the previous one before giving up.
        const backup = slotStorage.readBackup(useGameStore.persist.getOptions().name ?? slotKey(1));
        if (backup) {
          try {
            const recovered = validatePersisted(JSON.parse(backup));
            if (recovered.ok) {
              saveStatus.loaded();
              saveStatus.notify(`${check.reason} Your previous save was restored instead.`);
              return stateFromSave(recovered, current);
            }
          } catch {
            // fall through: the backup is unusable too
          }
        }
        saveStatus.notify(`${check.reason} A new game was started.`);
        return fresh;
      },
      // Unreadable JSON etc.
      onRehydrateStorage: () => (_state, error) => {
        if (error) saveStatus.notify('Your save could not be read. A new game was started.');
      },
    },
  ),
);
