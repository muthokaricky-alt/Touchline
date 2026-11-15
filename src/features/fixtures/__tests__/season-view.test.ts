import { buildFictionalDatabase } from '@/data/fictional';
import { autoPickLineup } from '@/game/lineup';
import { createSeason, playUserFixture } from '@/game/season/season-flow';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { buildSeasonView } from '../season-view';

const db = buildFictionalDatabase();
const USER = 'club_greywater_town';
const user = { clubId: USER, lineup: autoPickLineup(selectSquadCandidates(db, USER), '4-4-2'), tactics: DEFAULT_TACTICS };
let season = createSeason(db, 'comp_first_division', 2026, 8);
for (let i = 0; i < 3; i++) season = playUserFixture(db, season, user).season;
const view = buildSeasonView(db, season, USER);

describe('buildSeasonView', () => {
  it('groups fixtures into 14 matchdays and marks the current one', () => {
    expect(view.matchdays).toHaveLength(14);
    expect(view.matchdays.every((d) => d.fixtures.length === 4)).toBe(true);
    expect(view.currentMatchday).toBe(4);
    expect(view.matchdays.filter((d) => d.isCurrent).map((d) => d.matchday)).toEqual([4]);
  });

  it("shows scores for played matches and the user's outcome", () => {
    const played = view.matchdays.slice(0, 3).flatMap((d) => d.fixtures);
    expect(played.every((f) => f.score !== null)).toBe(true);
    const mine = played.filter((f) => f.involvesUser);
    expect(mine).toHaveLength(3);
    mine.forEach((f) => expect(['W', 'D', 'L']).toContain(f.userOutcome));
    expect(view.matchdays[5].fixtures.every((f) => f.score === null && f.userOutcome === null)).toBe(true);
  });

  it('names table rows and flags the user', () => {
    expect(view.table).toHaveLength(8);
    expect(view.table.filter((r) => r.isUser).map((r) => r.clubName)).toEqual(['Greywater Town']);
    expect(view.table.every((r) => r.played === 3)).toBe(true);
  });

  it('builds leaderboards with names and clubs', () => {
    expect(view.topScorers.length).toBeGreaterThan(0);
    expect(view.topScorers[0].name).not.toMatch(/^plr_/);
    expect(view.topScorers[0].clubShortName).toMatch(/^[A-Z]{3}$/);
    const goals = view.topScorers.map((r) => r.value);
    expect(goals).toEqual([...goals].sort((a, b) => b - a));
  });
});
