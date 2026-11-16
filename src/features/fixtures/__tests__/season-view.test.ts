import { buildFictionalDatabase } from '@/data/fictional';
import { domesticWorld } from '@/data/fictional/__fixtures__/domestic';
import { autoPickLineup } from '@/game/lineup';
import { createSeason, nextFixtureFor, playRemaining } from '@/game/season/season-flow';
import { playUserFixture } from '@/game/season/__fixtures__/play';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { buildCupView, buildLeagueView, competitionOptions } from '../season-view';

/** Full world for the competition list; England only (fast) for the views of played seasons. */
const world = buildFictionalDatabase();
const db = domesticWorld(world);
const USER = 'club_greywater_town';
const FIRST = 'comp_first_division';
const user = { clubId: USER, lineup: autoPickLineup(selectSquadCandidates(db, USER), '4-4-2'), tactics: DEFAULT_TACTICS };
let season = createSeason(db, 2026, 8);
for (let i = 0; i < 3; i++) season = playUserFixture(db, season, user).season;

describe('competitionOptions', () => {
  it("lists the user's league first, then the other league, the cup, then the leagues abroad by country", () => {
    expect(competitionOptions(world, createSeason(world, 2026, 8), USER).map((o) => [o.id, o.kind, o.label])).toEqual([
      [FIRST, 'league', 'First Division'],
      ['comp_second_division', 'league', 'Second Division'],
      ['comp_national_cup', 'cup', 'National Cup'],
      ['comp_kenya_premier', 'league', 'Kenya'],
      ['comp_kenya_cup', 'cup', 'Kenyan Cup'],
      ['comp_france_premier', 'league', 'France'],
      ['comp_france_cup', 'cup', 'French Cup'],
      ['comp_germany_premier', 'league', 'Germany'],
      ['comp_germany_cup', 'cup', 'German Cup'],
      ['comp_italy_premier', 'league', 'Italy'],
      ['comp_italy_cup', 'cup', 'Italian Cup'],
      ['comp_spain_premier', 'league', 'Spain'],
      ['comp_spain_cup', 'cup', 'Spanish Cup'],
    ]);
  });
});

describe('buildLeagueView', () => {
  const view = buildLeagueView(db, season, FIRST, USER);

  it('groups 38 matchdays of 10 fixtures and marks the current one', () => {
    expect(view.totalMatchdays).toBe(38);
    expect(view.matchdays).toHaveLength(38);
    expect(view.matchdays.every((d) => d.fixtures.length === 10)).toBe(true);
    expect(view.matchdays.filter((d) => d.isCurrent).map((d) => d.matchday)).toEqual([view.currentMatchday]);
  });

  it("shows the user's results with outcomes", () => {
    const mine = view.matchdays.flatMap((d) => d.fixtures).filter((f) => f.involvesUser && f.score);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    mine.forEach((f) => expect(['W', 'D', 'L']).toContain(f.userOutcome));
  });

  it('names table rows, flags the user and ranks scorers', () => {
    expect(view.table).toHaveLength(20);
    expect(view.table.filter((r) => r.isUser).map((r) => r.clubName)).toEqual(['Greywater Town']);
    const goals = view.topScorers.map((r) => r.value);
    expect(goals).toEqual([...goals].sort((a, b) => b - a));
  });
});

describe('buildCupView', () => {
  it('shows the first round and the user’s bye before it is played', () => {
    const view = buildCupView(db, createSeason(db, 2026, 8), 'comp_national_cup', USER)!;
    expect(view.rounds.map((r) => r.name)).toEqual(['First round']);
    expect(view.rounds[0].ties).toHaveLength(8);
    expect(view.userStatus).toBe('Bye to the Round of 32');
    expect(view.winnerName).toBeNull();
  });

  it('shows every round, a winner and the user’s fate after a full season', () => {
    let full = season;
    while (nextFixtureFor(full, USER)) full = playUserFixture(db, full, user).season;
    full = playRemaining(db, full).season;
    const view = buildCupView(db, full, 'comp_national_cup', USER)!;
    expect(view.rounds.map((r) => r.name)).toEqual(['First round', 'Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']);
    expect(view.winnerName).not.toBeNull();
    expect(view.userStatus).toMatch(/^(Winners!|Knocked out in the .+)$/);
    const level = view.rounds.flatMap((r) => r.ties).filter((t) => t.score && t.score.home === t.score.away);
    level.forEach((t) => expect(t.penalties).not.toBeNull());
  });
});

describe('competitionOptions for a manager abroad', () => {
  it('lists his league first, then England (leagues and cup), then the other countries', () => {
    const season = createSeason(world, 2026, 9);
    expect(competitionOptions(world, season, 'club_ndom_fc').map((o) => o.label)).toEqual([
      'Kenyan Premier Division',
      'Kenyan Cup',
      'First Div',
      'Second Div',
      'National Cup',
      'France',
      'French Cup',
      'Germany',
      'German Cup',
      'Italy',
      'Italian Cup',
      'Spain',
      'Spanish Cup',
    ]);
  });
});
