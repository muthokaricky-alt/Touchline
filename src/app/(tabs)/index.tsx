import { useMemo } from 'react';

import { buildDashboardSummary } from '@/features/dashboard/build-dashboard-summary';
import { previewDashboard } from '@/features/dashboard/dashboard.preview';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { saveStatus, useSaveStatus } from '@/persistence/save-status';
import { useGameStore } from '@/store/game-store';

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
  const startNextSeason = useGameStore((s) => s.startNextSeason);
  const finishSeason = useGameStore((s) => s.finishSeason);
  const saveNotice = useSaveStatus((s) => s.notice);
  const summary = useMemo(
    () => buildDashboardSummary(database, clubId, season, currentDate, inbox, previewDashboard),
    [database, clubId, season, currentDate, inbox],
  );
  return (
    <DashboardScreen
      summary={summary}
      onStartNextSeason={startNextSeason}
      onFinishSeason={finishSeason}
      saveNotice={saveNotice}
      onDismissSaveNotice={saveStatus.dismissNotice}
    />
  );
}
