import type { ClubId, GameDatabase, PlayerId, Position } from '@/data/schemas';
import { ageOn } from '@/utils/date';

import { fullName } from '../squad/squad-selectors';
import { playerAbility } from '../transfers/valuation';
import { formatPotentialRange, potentialOf, potentialRange } from './potential';

/** Age up to which a player counts as "developing" on the Training screen. */
export const YOUTH_AGE = 23;

export type ProspectView = {
  id: PlayerId;
  name: string;
  age: number;
  position: Position;
  /** Rounded current rating in his position. */
  rating: number;
  /** What the user is told, e.g. "13–16". */
  potential: string;
  /** Current ability as a share of the (true) potential, 0–1: how far along he is. */
  progress: number;
};

/** The user's young players, most room to grow first. */
export function selectProspects(db: GameDatabase, clubId: ClubId, date: string): ProspectView[] {
  const attributes = new Map(db.attributes.map((a) => [a.playerId, a]));
  const own = new Set(db.contracts.filter((c) => c.clubId === clubId).map((c) => c.playerId));
  return db.players
    .filter((p) => own.has(p.id) && ageOn(p.dateOfBirth, date) <= YOUTH_AGE)
    .flatMap((player) => {
      const attrs = attributes.get(player.id);
      if (!attrs) return [];
      const ability = playerAbility(player, attrs);
      const potential = potentialOf(player, attrs);
      return [
        {
          view: {
            id: player.id,
            name: fullName(player),
            age: ageOn(player.dateOfBirth, date),
            position: player.primaryPosition,
            rating: Math.round(ability),
            potential: formatPotentialRange(potentialRange(player.id, potential, ability, true)),
            progress: Math.min(1, ability / potential),
          },
          headroom: potential - ability,
        },
      ];
    })
    .sort((a, b) => b.headroom - a.headroom || a.view.id.localeCompare(b.view.id))
    .map((x) => x.view);
}
