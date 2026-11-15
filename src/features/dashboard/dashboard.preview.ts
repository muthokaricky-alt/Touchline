import type { DashboardSummary } from './dashboard.types';

/**
 * PREVIEW DATA — fictional clubs and people, used only so the Milestone 1
 * dashboard has something realistic to render.
 *
 * Replace with a selector over real game state once the football data
 * (Milestone 2) and competitions (Milestone 6) exist. Keep it out of UI
 * components (coding rule 9).
 */
export const previewDashboard: DashboardSummary = {
  manager: { name: 'A. Kamau' },
  club: {
    id: 'harbourside',
    name: 'Harbourside Athletic',
    shortName: 'HAR',
    leagueName: 'National Premier Division',
  },
  season: { label: '2026/27', currentDate: 'Sat 14 Nov 2026', matchday: 12, totalMatchdays: 38 },
  nextMatch: {
    opponentName: 'Kingsbridge Rovers',
    venue: 'home',
    competition: 'National Premier Division',
    date: 'Sat 21 Nov',
    kickOff: '15:00',
    opponentPosition: 3,
    opponentForm: ['W', 'W', 'D', 'W', 'L'],
  },
  seasonEnd: null,
  form: ['W', 'D', 'W', 'L', 'W'],
  table: [
    { position: 1, clubId: 'northgate', clubName: 'Northgate United', played: 11, goalDifference: 15, points: 27 },
    { position: 2, clubId: 'ashford', clubName: 'Ashford Town', played: 11, goalDifference: 11, points: 24 },
    { position: 3, clubId: 'kingsbridge', clubName: 'Kingsbridge Rovers', played: 11, goalDifference: 9, points: 23 },
    { position: 4, clubId: 'harbourside', clubName: 'Harbourside Athletic', played: 11, goalDifference: 6, points: 20 },
    { position: 5, clubId: 'millbrook', clubName: 'Millbrook City', played: 11, goalDifference: 4, points: 19 },
    { position: 6, clubId: 'redcliffe', clubName: 'Redcliffe FC', played: 11, goalDifference: 2, points: 17 },
    { position: 7, clubId: 'westvale', clubName: 'Westvale Albion', played: 11, goalDifference: 0, points: 15 },
    { position: 8, clubId: 'stonebridge', clubName: 'Stonebridge', played: 11, goalDifference: -3, points: 13 },
  ],
  squad: {
    playerCount: 26,
    averageFitness: 0.87,
    averageMorale: 0.74,
    injuredCount: 2,
    suspendedCount: 1,
  },
  finances: {
    balance: 18_400_000,
    transferBudget: 6_500_000,
    weeklyWageBill: 412_000,
    weeklyWageBudget: 450_000,
  },
  inbox: [
    { id: 'm1', from: 'Board of Directors', subject: 'Season expectations: top-half finish', date: '14 Nov', unread: true },
    { id: 'm2', from: 'Head of Medical', subject: 'Injury update: two players out', date: '13 Nov', unread: true },
    { id: 'm3', from: 'Chief Scout', subject: 'Scouting report ready', date: '11 Nov', unread: false },
  ],
};
