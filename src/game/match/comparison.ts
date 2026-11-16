import type { ClubId, GameDatabase } from '@/data/schemas';
import type { MatchOutcome } from '@/types/football';

import { buildAiTeam } from '../ai/opponent';
import type { Lineup } from '../lineup';
import { competitionName, leagueOfClub, leagueTable } from '../season/season-flow';
import type { Season } from '../season/season';
import { selectSquadCandidates } from '../squad/squad-selectors';
import { selectTeamSheet } from '../squad/team-sheet';
import { lineupStrength } from './build-match-team';

/** One side of the pre-match comparison. */
export type ComparisonSide = {
  /** Average rating of the XI expected to start (the user's current lineup; the AI's expected pick). */
  averageRating: number | null;
  /** League position, or null before anyone has played. */
  position: number | null;
  /** The league it's in, when it isn't the user's (a cup opponent from elsewhere). */
  otherLeagueName: string | null;
  /** Last five league results, oldest first. */
  form: MatchOutcome[];
};

/**
 * How the two teams compare before kick-off: the same measures for both, so
 * the pre-match screen can put them side by side. The opponent's XI is the
 * one the AI would pick against the user's current lineup (as the
 * "expected to play" line shows).
 */
export function matchComparison(
  db: GameDatabase,
  season: Season,
  userClubId: ClubId,
  userLineup: Lineup,
  opponentId: ClubId,
): { user: ComparisonSide; opponent: ComparisonSide } {
  const userSquad = selectSquadCandidates(db, userClubId);
  const ai = buildAiTeam(db, opponentId, lineupStrength(userLineup, userSquad));
  const userLeague = leagueOfClub(season, userClubId);

  const side = (clubId: ClubId, lineup: Lineup): ComparisonSide => {
    const league = leagueOfClub(season, clubId);
    const row = league ? leagueTable(db, season, league).find((r) => r.clubId === clubId) : undefined;
    return {
      averageRating: selectTeamSheet(db, clubId, lineup).averageRating,
      position: row && row.played > 0 ? row.position : null,
      otherLeagueName: league && league !== userLeague ? competitionName(db, league) : null,
      form: row?.form ?? [],
    };
  };
  return { user: side(userClubId, userLineup), opponent: side(opponentId, ai.lineup) };
}
