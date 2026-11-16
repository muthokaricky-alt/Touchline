import { seasonEnd } from '@/game/career/career-flow';
import { validateLineup } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';

import { createInitialGameState, flushSave, useGameStore } from '../game-store';

// The autosave's real storage can't run in Jest; use memory (see autosave.test.ts).
jest.mock('@/persistence/storage', () => {
  const { createMemoryStorage } = jest.requireActual('@/persistence/debounced-storage');
  return { platformStorage: createMemoryStorage() };
});

// The full world (with the leagues abroad): this test is about managing there.
// The store works without React: getState() reads it, actions update it.
beforeEach(() => {
  useGameStore.setState(createInitialGameState());
});
afterEach(() => flushSave()); // no pending save timer left behind

const state = () => useGameStore.getState();
const candidates = () => selectSquadCandidates(state().database, state().userClubId);

describe('a career abroad', () => {
  it('starts at a Kenyan club, plays in its league, and rolls over with the club still in it (no relegation abroad)', () => {
    const NDOM = 'club_ndom_fc';
    const KENYA = 'comp_kenya_premier';
    state().startCareer('Wanjiru', NDOM);
    expect(state().userClubId).toBe(NDOM);
    const result = state().playNextFixture();
    expect([result.home.clubId, result.away.clubId]).toContain(NDOM);
    expect(state().season.fixtures.find((f) => f.id === state().lastMatchFixtureId)?.competitionId).toBe(KENYA);

    // The rest of the season's results are filled in rather than simulated (~300 matches in the full world:
    // ~35 s). What's tested from here is the real season end, review and summer for a club abroad.
    const filled = {
      ...state().season,
      fixtures: state().season.fixtures.map((f) =>
        f.result ? f : { ...f, result: { score: { home: 1, away: 0 }, goals: [], cards: [], playerOfTheMatch: null } },
      ),
    };
    useGameStore.setState({ season: filled });
    state().finishSeason();
    const end = seasonEnd(state().database, state().season, state().userClubId, state().manager!)!;
    expect(end.review.expectation.competitionId).toBe(state().season.leagues.find((l) => l.clubIds.includes(state().userClubId))!.competitionId);
    const club = state().userClubId;
    state().startNextSeason();
    expect(state().season.startYear).toBe(2027);
    // Nobody is relegated abroad: if he's still at a Kenyan club, it's still in the Kenyan league.
    if (club === NDOM) expect(state().season.leagues.find((l) => l.competitionId === KENYA)!.clubIds).toContain(NDOM);
    expect(validateLineup(state().lineup, candidates()).filter((i) => i.severity === 'error')).toEqual([]);
  });
});
