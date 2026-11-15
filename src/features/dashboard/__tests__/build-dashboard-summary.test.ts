import { buildFictionalDatabase } from '@/data/fictional';
import { autoPickLineup } from '@/game/lineup';
import { advanceToUserFixture, createSeason, isSeasonComplete, nextFixtureFor, playRemaining } from '@/game/season/season-flow';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { addMessages } from '@/game/inbox/inbox';

import { buildDashboardSummary, INBOX_PREVIEW } from '../build-dashboard-summary';
import { previewDashboard } from '../dashboard.preview';

const db = buildFictionalDatabase();
const CLUB = 'club_greywater_town';
const user = { clubId: CLUB, lineup: autoPickLineup(selectSquadCandidates(db, CLUB), '4-4-2'), tactics: DEFAULT_TACTICS };
const fresh = createSeason(db, 2026, 5);

describe('buildDashboardSummary: pre-season', () => {
  const summary = buildDashboardSummary(db, CLUB, fresh, '2026-07-01', [], previewDashboard);

  it('uses the real club, league and season', () => {
    expect(summary.club).toEqual({ id: CLUB, name: 'Greywater Town', shortName: 'GRW', leagueName: 'First Division' });
    expect(summary.season).toEqual({ label: '2026/27', currentDate: 'Wed 1 Jul 2026', matchday: 1, totalMatchdays: 38 });
  });

  it('shows the first fixture with no table position yet', () => {
    expect(summary.nextMatch!.date).toBe('Sat 8 Aug');
    expect(summary.nextMatch!.competition).toBe('First Division');
    expect(summary.nextMatch!.opponentPosition).toBeNull();
    expect(summary.form).toEqual([]);
    expect(summary.seasonEnd).toBeNull();
    expect(summary.awaitingSeasonEnd).toBe(false);
  });

  it('lists all 20 league clubs with zero points', () => {
    expect(summary.table).toHaveLength(20);
    expect(summary.table.every((r) => r.points === 0 && r.played === 0)).toBe(true);
  });

  it('uses real squad size and finances, preview for the rest', () => {
    expect(summary.squad.playerCount).toBe(22);
    expect(summary.finances.balance).toBe(db.clubs.find((c) => c.id === CLUB)!.finances.balance);
    expect(summary.inbox).toEqual([]);
    expect(summary.unreadMessages).toBe(0);
  });

  it('shows the latest inbox messages and counts all unread ones', () => {
    const messages = Array.from({ length: 6 }, (_, i) => ({
      date: '2026-07-02', category: 'transfer' as const, from: 'Director of Football', title: `Deal ${i}`, body: '',
    }));
    const inbox = addMessages([], messages);
    const s = buildDashboardSummary(db, CLUB, fresh, '2026-07-02', inbox, previewDashboard);
    expect(s.inbox).toHaveLength(INBOX_PREVIEW);
    expect(s.inbox[0]).toEqual({ id: inbox[0].id, from: 'Director of Football', subject: inbox[0].title, date: '2 Jul 2026', unread: true });
    expect(s.unreadMessages).toBe(6);
  });

  it('falls back to the preview for a club outside the leagues', () => {
    expect(buildDashboardSummary(db, 'club_nowhere', fresh, '2026-07-01', [], previewDashboard)).toBe(previewDashboard);
  });
});

describe('buildDashboardSummary: during and after the season', () => {
  const afterOne = advanceToUserFixture(db, fresh, user).season;

  it('reflects played matches', () => {
    const summary = buildDashboardSummary(db, CLUB, afterOne, '2026-08-08', [], previewDashboard);
    expect(summary.season.matchday).toBe(2);
    expect(summary.form).toHaveLength(1);
    expect(summary.table.find((r) => r.clubId === CLUB)!.played).toBe(1);
  });

  it('labels a cup tie with the round', () => {
    let season = afterOne;
    while (nextFixtureFor(season, CLUB)?.competitionId !== 'comp_national_cup') season = advanceToUserFixture(db, season, user).season;
    const summary = buildDashboardSummary(db, CLUB, season, '2026-08-08', [], previewDashboard);
    expect(summary.nextMatch!.competition).toBe('National Cup · Round of 32');
    expect(summary.nextMatch!.kickOff).toBe('19:45');
  });

  it('asks to play out the season once the user is done, then summarises it', () => {
    let season = afterOne;
    while (nextFixtureFor(season, CLUB)) season = advanceToUserFixture(db, season, user).season;
    if (!isSeasonComplete(season)) {
      const waiting = buildDashboardSummary(db, CLUB, season, '2027-04-24', [], previewDashboard);
      expect(waiting.nextMatch).toBeNull();
      expect(waiting.awaitingSeasonEnd).toBe(true);
      expect(waiting.seasonEnd).toBeNull();
      season = playRemaining(db, season);
    }
    const summary = buildDashboardSummary(db, CLUB, season, '2027-05-01', [], previewDashboard);
    expect(summary.awaitingSeasonEnd).toBe(false);
    expect(summary.seasonEnd).toMatchObject({ leagueName: 'First Division', cupName: 'National Cup' });
    expect(summary.seasonEnd!.userPosition).toBe(summary.table.find((r) => r.clubId === CLUB)!.position);
    expect(summary.seasonEnd!.championName).toBe(summary.table[0].clubName);
    expect(summary.seasonEnd!.cupWinnerName).not.toBeNull();
  });
});
