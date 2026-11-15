import { useRouter } from 'expo-router';

import { TeamSelectionScreen } from '@/features/team/TeamSelectionScreen';
import { useGameStore } from '@/store/game-store';
import { useTeamSheet, useUserClub } from '@/store/hooks';

/** Route: team selection. Tactical instructions join this screen in Milestone 4. */
export default function TacticsRoute() {
  const router = useRouter();
  const club = useUserClub();
  const sheet = useTeamSheet();
  // Actions are stable functions, so selecting them never causes re-renders.
  const changeFormation = useGameStore((s) => s.changeFormation);
  const removeFromLineup = useGameStore((s) => s.removeFromLineup);
  const autoPick = useGameStore((s) => s.autoPick);

  const openPicker = (target: string) => router.push({ pathname: '/select-player', params: { target } });

  return (
    <TeamSelectionScreen
      clubName={club?.name ?? ''}
      sheet={sheet}
      onFormationChange={changeFormation}
      onSlotPress={openPicker}
      onAddSubstitute={() => openPicker('bench')}
      onRemoveSubstitute={removeFromLineup}
      onAutoPick={autoPick}
    />
  );
}
