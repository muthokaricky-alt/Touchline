import { useRouter } from 'expo-router';

import { TrainingScreen } from '@/features/training/TrainingScreen';
import { useGameStore } from '@/store/game-store';
import { useProspects } from '@/store/hooks';

/** Route: club training settings and young players' development. */
export default function TrainingRoute() {
  const router = useRouter();
  const training = useGameStore((s) => s.training);
  const setTraining = useGameStore((s) => s.setTraining);
  const prospects = useProspects();

  return (
    <TrainingScreen
      training={training}
      onChange={setTraining}
      prospects={prospects}
      onPlayerPress={(id) => router.push({ pathname: '/player/[id]', params: { id } })}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/squad'))}
    />
  );
}
