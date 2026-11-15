import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppText, Button, PageHeader, Screen } from '@/components/ui';
import { PlayerProfileScreen } from '@/features/player/PlayerProfileScreen';
import { useGameStore } from '@/store/game-store';
import { usePlayerProfile } from '@/store/hooks';

/**
 * Web static export pre-renders one HTML page per player. The build runs this
 * in Node; it works because the store's database is deterministic (seeded),
 * so the build and the browser agree on which players exist.
 */
export async function generateStaticParams(): Promise<Record<string, string>[]> {
  return useGameStore.getState().database.players.map((player) => ({ id: player.id }));
}

export default function PlayerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const profile = usePlayerProfile(id);

  // Deep links (or a refreshed web page) may have no history to go back to.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/squad'));

  if (!profile) {
    return (
      <Screen bottomInset>
        <PageHeader title="Player not found" />
        <AppText color="textSecondary">There's no player with id “{id}”.</AppText>
        <Button label="Back to squad" onPress={goBack} />
      </Screen>
    );
  }

  return <PlayerProfileScreen profile={profile} onBack={goBack} />;
}
