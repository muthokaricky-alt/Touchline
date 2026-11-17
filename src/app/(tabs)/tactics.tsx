import { useRouter } from 'expo-router';
import { useState } from 'react';

import { InstructionsPanel } from '@/features/tactics/InstructionsPanel';
import { TacticsScreen, type TacticsView } from '@/features/tactics/TacticsScreen';
import { TeamSelectionPanel } from '@/features/team/TeamSelectionPanel';
import { useGameStore } from '@/store/game-store';
import { useTacticsView, useTeamSheet, useUserClub } from '@/store/hooks';

/**
 * Route: the Tactics tab, with two views (lineup / instructions).
 *
 * The active view is local state, not a URL param: the static web export
 * pre-renders this page without query strings, so a URL-driven view could
 * differ between the HTML and the browser's first render.
 */
export default function TacticsRoute() {
  const router = useRouter();
  const [view, setView] = useState<TacticsView>('lineup');
  const club = useUserClub();
  const sheet = useTeamSheet();
  const { tactics, style, notes } = useTacticsView();

  // Actions are stable functions, so selecting them never causes re-renders.
  const changeFormation = useGameStore((s) => s.changeFormation);
  const removeFromLineup = useGameStore((s) => s.removeFromLineup);
  const swapPlaces = useGameStore((s) => s.swapPlaces);
  const autoPick = useGameStore((s) => s.autoPick);
  const setInstruction = useGameStore((s) => s.setInstruction);
  const applyPlayingStyle = useGameStore((s) => s.applyPlayingStyle);

  const openPicker = (target: string) => router.push({ pathname: '/select-player', params: { target } });
  const summary = [sheet.formationId, style?.name ?? 'Custom', `avg rating ${sheet.averageRating ?? '–'}`].join(' · ');

  return (
    <TacticsScreen clubName={club?.name ?? ''} summary={summary} view={view} onViewChange={setView}>
      {view === 'lineup' ? (
        <TeamSelectionPanel
          sheet={sheet}
          onFormationChange={changeFormation}
          onChooseForSlot={openPicker}
          onSwap={swapPlaces}
          onOpenPlayer={(id) => router.push({ pathname: '/player/[id]', params: { id } })}
          onAddSubstitute={() => openPicker('bench')}
          onRemoveSubstitute={removeFromLineup}
          onAutoPick={autoPick}
        />
      ) : (
        <InstructionsPanel
          tactics={tactics}
          style={style}
          notes={notes}
          onStyleChange={applyPlayingStyle}
          onInstructionChange={setInstruction}
        />
      )}
    </TacticsScreen>
  );
}
