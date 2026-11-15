import { useMemo } from 'react';

import { FixturesScreen } from '@/features/fixtures/FixturesScreen';
import { buildSeasonView } from '@/features/fixtures/season-view';
import { useGameStore } from '@/store/game-store';

/** Route: the league season (fixtures, table, leaderboards). */
export default function FixturesRoute() {
  const database = useGameStore((s) => s.database);
  const season = useGameStore((s) => s.season);
  const clubId = useGameStore((s) => s.userClubId);
  const view = useMemo(() => buildSeasonView(database, season, clubId), [database, season, clubId]);
  return <FixturesScreen season={view} />;
}
