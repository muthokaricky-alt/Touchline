import { useMemo } from 'react';

import { buildDashboardSummary } from '@/features/dashboard/build-dashboard-summary';
import { previewDashboard } from '@/features/dashboard/dashboard.preview';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { saveStatus, useSaveStatus } from '@/persistence/save-status';
import { useGameStore } from '@/store/game-store';
import { useBoard, useConditionToday, useSeasonReview } from '@/store/hooks';

/**
 * Route file: stays thin. It decides *which* data the dashboard shows;
 * DashboardScreen decides *how* it looks. Real game data is merged over the
 * preview for the parts that exist so far (see buildDashboardSummary).
 */
export default function HomeRoute() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const season = useGameStore((s) => s.season);
  const currentDate = useGameStore((s) => s.currentDate);
  const inbox = useGameStore((s) => s.inbox);
  const today = useConditionToday();
  const startNextSeason = useGameStore((s) => s.startNextSeason);
  const chooseNewJob = useGameStore((s) => s.chooseNewJob);
  const managerName = useGameStore((s) => s.manager?.name ?? null);
  const board = useBoard();
  const seasonReview = useSeasonReview();
  const finishSeason = useGameStore((s) => s.finishSeason);
  const saveNotice = useSaveStatus((s) => s.notice);
  const summary = useMemo(
    () => buildDashboardSummary(database, clubId, season, currentDate, inbox, previewDashboard, today),
    [database, clubId, season, currentDate, inbox, today],
  );
  return (
    <DashboardScreen
      summary={managerName ? { ...summary, manager: { name: managerName } } : summary}
      board={board}
      seasonReview={seasonReview}
      onAcceptJob={chooseNewJob}
      onStartNextSeason={(clubId) => startNextSeason(clubId ?? null)}
      onFinishSeason={finishSeason}
      saveNotice={saveNotice}
      onDismissSaveNotice={saveStatus.dismissNotice}
    />
  );
}
