import type { ClubId, GameDatabase, PlayerId } from '@/data/schemas';
import { formatDate } from '@/utils/format';

import type { NewMessage } from '../inbox/inbox';
import { removeAndRefill, starterIds, type Lineup } from '../lineup';
import { fullName, selectSquadCandidates } from '../squad/squad-selectors';
import { isInjured, type ConditionState, type NewInjury } from './condition';

/**
 * What condition changes mean for the USER after a matchday: injured players
 * leave the lineup (best available player fills in), and the Head of Medical
 * reports each new injury.
 */

/** Injury-aware lineup: every injured player is taken out and replaced from the fit players. */
export function withoutInjured(db: GameDatabase, clubId: ClubId, lineup: Lineup, condition: ConditionState): Lineup {
  const fit = selectSquadCandidates(db, clubId).filter((c) => !isInjured(condition, c.player.id));
  const selected = [...starterIds(lineup), ...lineup.substitutes];
  return selected.filter((id) => isInjured(condition, id)).reduce((next, id) => removeAndRefill(next, id, fit), lineup);
}

/** About how long, in words a manager would use. */
export function durationLabel(days: number): string {
  if (days <= 10) return `about ${days} days`;
  const weeks = Math.round(days / 7);
  return weeks < 8 ? `about ${weeks} weeks` : `about ${Math.round(days / 30)} months`;
}

export function injuryMessages(
  db: GameDatabase,
  clubId: ClubId,
  injuries: readonly NewInjury[],
  date: string,
  where: 'match' | 'training' = 'match',
): NewMessage[] {
  const nameOf = (id: PlayerId) => {
    const p = db.players.find((x) => x.id === id);
    return p ? fullName(p) : id;
  };
  return injuries
    .filter((i) => i.clubId === clubId)
    .map((i) => ({
      date,
      category: 'medical' as const,
      from: 'Head of Medical',
      title: `${nameOf(i.playerId)} injured${where === 'training' ? ' in training' : ''}: ${i.injury.name}`,
      body: `He'll be out for ${durationLabel(i.days)} and should be available again on ${formatDate(i.injury.returns)}. He has been taken out of your lineup.`,
    }));
}
