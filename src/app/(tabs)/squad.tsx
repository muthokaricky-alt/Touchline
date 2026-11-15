import { useRouter } from 'expo-router';

import { SquadScreen } from '@/features/squad/SquadScreen';
import { useSquadGroups, useUserClub } from '@/store/hooks';

/** Route: reads the user's squad from the store and opens profiles on tap. */
export default function SquadRoute() {
  const router = useRouter();
  const club = useUserClub();
  const groups = useSquadGroups();

  return (
    <SquadScreen
      clubName={club?.name ?? ''}
      groups={groups}
      onPlayerPress={(id) => router.push({ pathname: '/player/[id]', params: { id } })}
      onOpenMarket={() => router.push('/transfers')}
      onOpenTraining={() => router.push('/training')}
    />
  );
}
