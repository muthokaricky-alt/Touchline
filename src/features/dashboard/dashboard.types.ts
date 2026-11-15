import type { MatchOutcome } from '@/types/football';

/**
 * The data the dashboard needs, shaped for display.
 *
 * This is a *view model*: later milestones will build it from real game state
 * (career, fixtures, league table, finances). The dashboard screen only knows
 * about this shape, so swapping preview data for real data won't touch the UI.
 */
export type DashboardSummary = {
  manager: { name: string };
  club: { id: string; name: string; shortName: string; leagueName: string };
  season: { label: string; currentDate: string; matchday: number; totalMatchdays: number };
  /** null once the user has no fixtures left this season. */
  nextMatch: NextMatchSummary | null;
  /** The user's fixtures are done but other matches (e.g. the cup final) remain. */
  awaitingSeasonEnd: boolean;
  /** Set when the season is complete. */
  seasonEnd: SeasonEndSummary | null;
  form: readonly MatchOutcome[];
  table: readonly LeagueTableRow[];
  squad: SquadStatusSummary;
  finances: FinanceSummary;
  inbox: readonly InboxMessage[];
};

export type NextMatchSummary = {
  /** Real club id when the opponent comes from game data (used to start a match). */
  opponentId?: string;
  opponentName: string;
  venue: 'home' | 'away';
  competition: string;
  date: string;
  kickOff: string;
  /** null before any league match has been played (no meaningful position yet). */
  opponentPosition: number | null;
  opponentForm: readonly MatchOutcome[];
};

export type SeasonEndSummary = {
  leagueName: string;
  championName: string;
  userPosition: number;
  userZone: 'champion' | 'promotion' | 'relegation' | null;
  cupName: string | null;
  cupWinnerName: string | null;
};

export type LeagueTableRow = {
  position: number;
  clubId: string;
  clubName: string;
  played: number;
  goalDifference: number;
  points: number;
};

export type SquadStatusSummary = {
  playerCount: number;
  /** 0–1 */
  averageFitness: number;
  /** 0–1 */
  averageMorale: number;
  injuredCount: number;
  suspendedCount: number;
};

/** All amounts are whole currency units. */
export type FinanceSummary = {
  balance: number;
  transferBudget: number;
  weeklyWageBill: number;
  weeklyWageBudget: number;
};

export type InboxMessage = {
  id: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
};
