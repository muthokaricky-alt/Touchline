import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppText, Button, PageHeader, Screen } from '@/components/ui';
import { PlayerProfileScreen } from '@/features/player/PlayerProfileScreen';
import { useGameStore } from '@/store/game-store';
import { usePlayerProfile } from '@/store/hooks';

/**
 * Web static export pre-renders an HTML page per player listed here. The
 * build runs this in Node; it works because the store's initial state is
 * deterministic (seeded).
 *
 * Only the user's squad is pre-rendered: with 880 players, rendering every
 * profile made the export huge. Other profiles still open fine via in-app
 * navigation; only a direct URL load of them isn't supported on web.
 */
export async function generateStaticParams(): Promise<Record<string, string>[]> {
  const { database, userClubId } = useGameStore.getState();
  return database.contracts.filter((c) => c.clubId === userClubId).map((c) => ({ id: c.playerId }));
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
