import { buildFictionalDatabase } from '@/data/fictional';
import { autoPickLineup } from '@/game/lineup';
import { createSeason, isSeasonComplete, playUserFixture } from '@/game/season/season-flow';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { buildDashboardSummary } from '../build-dashboard-summary';
import { previewDashboard } from '../dashboard.preview';

const db = buildFictionalDatabase();
const CLUB = 'club_greywater_town';
const user = { clubId: CLUB, lineup: autoPickLineup(selectSquadCandidates(db, CLUB), '4-4-2'), tactics: DEFAULT_TACTICS };
const fresh = createSeason(db, 'comp_first_division', 2026, 5);

describe('buildDashboardSummary: pre-season', () => {
  const summary = buildDashboardSummary(db, CLUB, fresh, '2026-07-01', previewDashboard);

  it('uses the real club, league and season', () => {
    expect(summary.club).toEqual({ id: CLUB, name: 'Greywater Town', shortName: 'GRW', leagueName: 'First Division' });
    expect(summary.season).toEqual({ label: '2026/27', currentDate: 'Wed 1 Jul 2026', matchday: 1, totalMatchdays: 14 });
  });

  it('shows the first fixture with no table position yet', () => {
    expect(summary.nextMatch).not.toBeNull();
    expect(summary.nextMatch!.date).toBe('Sat 8 Aug');
    expect(summary.nextMatch!.competition).toBe('First Division');
    expect(summary.nextMatch!.opponentPosition).toBeNull();
    expect(summary.nextMatch!.opponentId).not.toBe(CLUB);
    expect(summary.form).toEqual([]);
    expect(summary.seasonEnd).toBeNull();
  });

  it('lists all 8 league clubs with zero points', () => {
    expect(summary.table).toHaveLength(8);
    expect(summary.table.every((r) => r.points === 0 && r.played === 0)).toBe(true);
  });

  it('uses real squad size and finances, preview for the rest', () => {
    expect(summary.squad.playerCount).toBe(22);
    expect(summary.finances.balance).toBe(db.clubs.find((c) => c.id === CLUB)!.finances.balance);
    expect(summary.inbox).toBe(previewDashboard.inbox);
  });

  it('falls back to the preview for an unknown club', () => {
    expect(buildDashboardSummary(db, 'club_nowhere', fresh, '2026-07-01', previewDashboard)).toBe(previewDashboard);
  });
});

describe('buildDashboardSummary: during and after the season', () => {
  const afterOne = playUserFixture(db, fresh, user).season;

  it('reflects played matches', () => {
    const summary = buildDashboardSummary(db, CLUB, afterOne, '2026-08-08', previewDashboard);
    expect(summary.season.matchday).toBe(2);
    expect(summary.form).toHaveLength(1);
    expect(summary.table.find((r) => r.clubId === CLUB)!.played).toBe(1);
    expect(summary.nextMatch!.opponentPosition).toBeGreaterThan(0);
  });

  it('summarises the finished season', () => {
    let season = afterOne;
    while (!isSeasonComplete(season)) season = playUserFixture(db, season, user).season;
    const summary = buildDashboardSummary(db, CLUB, season, '2026-11-07', previewDashboard);
    expect(summary.nextMatch).toBeNull();
    expect(summary.seasonEnd).not.toBeNull();
    expect(summary.seasonEnd!.userPosition).toBe(summary.table.find((r) => r.clubId === CLUB)!.position);
    expect(summary.seasonEnd!.championName).toBe(summary.table[0].clubName);
    expect(summary.season.matchday).toBe(14);
  });
});
