import type { PositionFit } from '@/game/squad/position-fit';

import { Pill, type PillTone } from './Pill';

const FIT: Record<PositionFit, { label: string; tone: PillTone }> = {
  natural: { label: 'Natural', tone: 'accent' },
  accomplished: { label: 'Accomplished', tone: 'neutral' },
  unfamiliar: { label: 'Unfamiliar', tone: 'danger' },
};

/** How comfortable a player is in a position. Uses words, not just colour. */
export function FitPill({ fit }: { fit: PositionFit }) {
  return <Pill label={FIT[fit].label} tone={FIT[fit].tone} />;
}
