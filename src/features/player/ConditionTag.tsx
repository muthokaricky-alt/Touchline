import { Pill } from '@/components/ui';

/** Fitness at or above this isn't worth a tag in lists. */
const SHOW_BELOW = 90;
/** Same threshold as the lineup warning (game/lineup LOW_FITNESS). */
const LOW = 75;

/**
 * Compact condition marker for player rows: "Injured", or fitness when it's
 * notably below full. Renders nothing for a fit, fresh player.
 */
export function ConditionTag({ fitness, injured }: { fitness: number; injured: boolean }) {
  if (injured) return <Pill label="Injured" tone="danger" />;
  if (fitness < SHOW_BELOW) return <Pill label={`${fitness}%`} tone={fitness < LOW ? 'warning' : 'neutral'} />;
  return null;
}
