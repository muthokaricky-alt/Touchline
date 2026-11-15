import { useMemo, useState } from 'react';

import { FixturesScreen } from '@/features/fixtures/FixturesScreen';
import { buildCupView, buildLeagueView, competitionOptions } from '@/features/fixtures/season-view';
import { useGameStore } from '@/store/game-store';

/** Route: fixtures, tables and the cup for the current season. */
export default function FixturesRoute() {
  const database = useGameStore((s) => s.database);
  const season = useGameStore((s) => s.season);
  const clubId = useGameStore((s) => s.userClubId);

  const options = useMemo(() => competitionOptions(database, season, clubId), [database, season, clubId]);
  const [chosen, setChosen] = useState<string | null>(null);
  // Default (and fallback if the user's league changed after promotion): the first option.
  const selected = options.some((o) => o.id === chosen) ? chosen! : options[0].id;

  const view = useMemo(() => {
    const option = options.find((o) => o.id === selected)!;
    return option.kind === 'cup' ? buildCupView(database, season, clubId)! : buildLeagueView(database, season, selected, clubId);
  }, [options, selected, database, season, clubId]);

  return <FixturesScreen seasonLabel={season.label} options={options} selected={selected} onSelect={setChosen} view={view} />;
}
