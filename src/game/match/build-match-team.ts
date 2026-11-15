import type { ClubId, GameDatabase } from '@/data/schemas';
import type { MatchTeamInput } from '@/engine/types';

import { matchConditions, type ConditionState } from '../condition/condition';
import { getFormation } from '../formations';
import type { Lineup, LineupCandidate } from '../lineup';
import { findClub, selectSquadCandidates } from '../squad/squad-selectors';
import { effectiveRating } from '../squad/position-fit';
import type { Tactics } from '../tactics/tactics';

/** Packs a club's lineup, tactics, squad and (optionally) players' condition into the engine's input shape. */
export function buildMatchTeam(db: GameDatabase, clubId: ClubId, lineup: Lineup, tactics: Tactics, condition?: ConditionState): MatchTeamInput {
  return {
    clubId,
    name: findClub(db, clubId)?.name ?? clubId,
    lineup,
    tactics,
    squad: selectSquadCandidates(db, clubId),
    ...(condition ? { condition: matchConditions(condition) } : {}),
  };
}

/**
 * Average effective rating of the starting XI (empty slots count as 0).
 * A simple "how good is this team today" number used by the AI.
 */
export function lineupStrength(lineup: Lineup, squad: readonly LineupCandidate[]): number {
  const byId = new Map(squad.map((c) => [c.player.id, c]));
  const slots = getFormation(lineup.formationId).slots;
  const total = slots.reduce((sum, slot) => {
    const id = lineup.starters[slot.id];
    const c = id ? byId.get(id) : undefined;
    return sum + (c ? effectiveRating(c.player, c.attributes, slot.position) : 0);
  }, 0);
  return total / slots.length;
}
