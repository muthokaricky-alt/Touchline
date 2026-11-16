import type { GameDatabase } from '@/data/schemas';

import { emptyConditions } from '../../condition/condition';
import { withoutUnavailable } from '../../condition/squad-care';
import { suspendedFor } from '../../discipline/suspensions';
import type { Season } from '../season';
import { advanceToUserFixture, nextFixtureFor, type UserTeam } from '../season-flow';

/**
 * Test helper: plays the user's next fixture like the store does, with any
 * player banned from it swapped out first. A fixed lineup kept for a whole
 * season would eventually field a suspended player, which the season flow
 * refuses. (Outside __tests__ so Jest doesn't run it as a suite.)
 */
export function playUserFixture(db: GameDatabase, season: Season, user: UserTeam) {
  const fixture = nextFixtureFor(season, user.clubId);
  const banned = suspendedFor(season, fixture);
  const lineup = withoutUnavailable(db, user.clubId, user.lineup, emptyConditions(fixture?.date ?? '2026-07-01'), banned);
  return advanceToUserFixture(db, season, { ...user, lineup });
}
