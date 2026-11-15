import type { ReactNode } from 'react';

import { PageHeader, Screen, SegmentedControl } from '@/components/ui';

export type TacticsView = 'lineup' | 'instructions';

const SEGMENTS = [
  { value: 'lineup', label: 'Lineup' },
  { value: 'instructions', label: 'Instructions' },
] as const satisfies readonly { value: TacticsView; label: string }[];

type TacticsScreenProps = {
  clubName: string;
  /** e.g. "4-4-2 · Counter-attack · avg 14.3" */
  summary: string;
  view: TacticsView;
  onViewChange: (view: TacticsView) => void;
  /** The active panel (team selection or instructions). */
  children: ReactNode;
};

/** Shell of the Tactics tab: header, view switch, and whichever panel is active. */
export function TacticsScreen({ clubName, summary, view, onViewChange, children }: TacticsScreenProps) {
  return (
    <Screen>
      <PageHeader overline={clubName} title="Tactics" subtitle={summary} />
      <SegmentedControl segments={SEGMENTS} value={view} onChange={onViewChange} accessibilityLabel="Tactics view" />
      {children}
    </Screen>
  );
}
