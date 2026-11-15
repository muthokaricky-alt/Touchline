import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { NewCareerScreen } from '@/features/career/NewCareerScreen';
import { selectCareerChoices } from '@/game/career/career-view';
import { createInitialGameState, getBaseDatabase, useGameStore } from '@/store/game-store';

/** Route: start a career (shown whenever no career is in progress). */
export default function NewCareerRoute() {
  const router = useRouter();
  const startCareer = useGameStore((s) => s.startCareer);
  // Choices come from the fresh generated world: a new career always starts there.
  const leagues = useMemo(() => {
    const fresh = createInitialGameState(getBaseDatabase());
    return selectCareerChoices(fresh.database, fresh.season);
  }, []);

  return (
    <NewCareerScreen
      leagues={leagues}
      onStart={(name, clubId) => {
        try {
          startCareer(name, clubId);
          router.replace('/');
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      }}
    />
  );
}
