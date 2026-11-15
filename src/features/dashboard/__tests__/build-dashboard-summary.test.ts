import { buildFictionalDatabase } from '@/data/fictional';

import { buildDashboardSummary } from '../build-dashboard-summary';
import { previewDashboard } from '../dashboard.preview';

const db = buildFictionalDatabase();
const CLUB = 'club_greywater_town';
const summary = buildDashboardSummary(db, CLUB, previewDashboard);

describe('buildDashboardSummary', () => {
  it('uses the real club and league', () => {
    expect(summary.club).toEqual({
      id: CLUB,
      name: 'Greywater Town',
      shortName: 'GRW',
      leagueName: 'First Division',
    });
    expect(summary.nextMatch.competition).toBe('First Division');
  });

  it('builds the table from the real league clubs, including the user club', () => {
    expect(summary.table).toHaveLength(8);
    expect(summary.table.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(summary.table.map((r) => r.clubId)).toContain(CLUB);
    const realNames = new Set(db.clubs.map((c) => c.name));
    summary.table.forEach((row) => expect(realNames.has(row.clubName)).toBe(true));
  });

  it('picks a real opponent that is not the user club', () => {
    const opponent = summary.table.find((r) => r.clubName === summary.nextMatch.opponentName);
    expect(opponent).toBeDefined();
    expect(opponent!.clubId).not.toBe(CLUB);
    expect(summary.nextMatch.opponentPosition).toBe(opponent!.position);
  });

  it('uses real squad size and finances', () => {
    const club = db.clubs.find((c) => c.id === CLUB)!;
    const wageBill = db.contracts.filter((c) => c.clubId === CLUB).reduce((s, c) => s + c.weeklyWage, 0);
    expect(summary.squad.playerCount).toBe(22);
    expect(summary.finances).toEqual({
      balance: club.finances.balance,
      transferBudget: club.finances.transferBudget,
      weeklyWageBill: wageBill,
      weeklyWageBudget: club.finances.weeklyWageBudget,
    });
  });

  it('keeps preview data for things that do not exist yet', () => {
    expect(summary.inbox).toBe(previewDashboard.inbox);
    expect(summary.form).toBe(previewDashboard.form);
    expect(summary.squad.averageFitness).toBe(previewDashboard.squad.averageFitness);
  });

  it('falls back to the preview for an unknown club', () => {
    expect(buildDashboardSummary(db, 'club_nowhere', previewDashboard)).toBe(previewDashboard);
  });
});
