import type { PlayerId } from '@/data/schemas';
import { ageOn } from '@/utils/date';

import { formatPotentialRange, potentialOf, potentialRange } from '../development/potential';
import { addMessages, type NewMessage } from '../inbox/inbox';
import { fullName } from '../squad/squad-selectors';
import { departed, type TransferCareer } from '../transfers/career';
import { playerAbility } from '../transfers/valuation';
import { admitIntake, retirePlayers, type Leaver } from './renewal';

/**
 * The summer's renewal from the user's point of view, in two steps the
 * store runs either side of contract expiries (so AI clubs refill squads
 * AFTER their retirements):
 *   1. retireFromCareer: retiring players leave (the user's lineup is refilled)
 *   2. admitIntakeToCareer: the academy intake joins
 * The inbox explains both. Pure, like the other career functions.
 */
export function retireFromCareer(career: TransferCareer, seed: number, year: number): { career: TransferCareer; leavers: Leaver[] } {
  const date = `${year}-07-01`;
  const nameOf = (id: PlayerId) => {
    const p = career.db.players.find((x) => x.id === id);
    return p ? fullName(p) : id;
  };
  const retired = retirePlayers(career.db, seed, year);
  const userLeavers = retired.leavers.filter((l) => l.clubId === career.userClubId);
  let next: TransferCareer = { ...career, db: retired.db };
  for (const l of userLeavers) next = departed(next, retired.db, l.playerId);
  const messages: NewMessage[] = userLeavers.length
    ? [
        {
          date,
          category: 'squad',
          from: 'Director of Football',
          title: `${userLeavers.length} player${userLeavers.length === 1 ? '' : 's'} retired`,
          body: `${userLeavers.map((l) => nameOf(l.playerId)).join(', ')} hung up ${userLeavers.length === 1 ? 'his boots' : 'their boots'} at the end of the season.`,
        },
      ]
    : [];
  return { career: { ...next, inbox: addMessages(next.inbox, messages) }, leavers: retired.leavers };
}

export function admitIntakeToCareer(career: TransferCareer, seed: number, year: number): TransferCareer {
  const date = `${year}-07-01`;
  const intake = admitIntake(career.db, seed, year, career.userClubId);
  const next: TransferCareer = { ...career, db: intake.db };
  const messages: NewMessage[] = [];
  if (intake.userSigned.length || intake.userReleased.length) {
    const describe = (id: PlayerId) => {
      const p = intake.db.players.find((x) => x.id === id)!;
      const a = intake.db.attributes.find((x) => x.playerId === id)!;
      const range = formatPotentialRange(potentialRange(id, potentialOf(p, a), playerAbility(p, a), 1));
      return `${fullName(p)} (${p.primaryPosition}, ${ageOn(p.dateOfBirth, date)}, potential ${range})`;
    };
    const lines = [
      intake.userSigned.length ? `Signed to 3-year youth contracts: ${intake.userSigned.map(describe).join('; ')}.` : null,
      intake.userReleased.length ? `No room in a full squad for: ${intake.userReleased.map(describe).join('; ')}. They are free agents.` : null,
      'Release anyone you don’t want from their profile; youth wages are low, so it costs little.',
    ].filter((l): l is string => l !== null);
    messages.push({
      date,
      category: 'squad',
      from: 'Head of Youth Development',
      title: `Youth intake: ${intake.userSigned.length} academy player${intake.userSigned.length === 1 ? '' : 's'}`,
      body: lines.join(' '),
    });
  }
  return { ...next, inbox: addMessages(next.inbox, messages) };
}
