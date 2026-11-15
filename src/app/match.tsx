import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import type { ClubId } from '@/data/schemas';
import { buildDashboardSummary } from '@/features/dashboard/build-dashboard-summary';
import { previewDashboard } from '@/features/dashboard/dashboard.preview';
import { MatchCentreScreen } from '@/features/match/MatchCentreScreen';
import { MatchSetupScreen } from '@/features/match/MatchSetupScreen';
import { buildRatingRows, buildStatRows, buildTimeline } from '@/features/match/timeline';
import type { MatchResult } from '@/engine/types';
import type { MatchVenue } from '@/game/match/friendly';
import { useGameStore } from '@/store/game-store';
import { useLeagueOpponents, useOpponentPreview, usePlayerNames, useTacticsView, useTeamSheet, useUserClub } from '@/store/hooks';

/**
 * Route: friendly match. Two states, decided by the store:
 *   no lastMatch → setup (opponent, venue, kick off)
 *   lastMatch    → match centre (live replay, then report)
 *
 * No URL params: the static web export pre-renders this page once, with
 * no match, which is exactly what the browser also renders first.
 */
export default function MatchRoute() {
  const router = useRouter();
  const lastMatch = useGameStore((s) => s.lastMatch);
  const clearMatch = useGameStore((s) => s.clearMatch);
  // Held here (not in MatchSetup) so "Play another" remembers the last choice:
  // MatchSetup unmounts while the match centre is showing.
  const [chosenOpponent, setChosenOpponent] = useState<ClubId | null>(null);
  const [venue, setVenue] = useState<MatchVenue>('home');

  const done = () => {
    clearMatch();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return lastMatch ? (
    // key: a new match remounts the centre, restarting the replay.
    <MatchCentre key={`${lastMatch.seed}-${lastMatch.home.clubId}-${lastMatch.away.clubId}`} result={lastMatch} onPlayAgain={clearMatch} onDone={done} />
  ) : (
    <MatchSetup
      chosenOpponent={chosenOpponent}
      onOpponentChange={setChosenOpponent}
      venue={venue}
      onVenueChange={setVenue}
      onBack={done}
      onEditTeam={() => router.navigate('/tactics')}
    />
  );
}

type MatchSetupProps = {
  chosenOpponent: ClubId | null;
  onOpponentChange: (id: ClubId) => void;
  venue: MatchVenue;
  onVenueChange: (venue: MatchVenue) => void;
  onBack: () => void;
  onEditTeam: () => void;
};

function MatchSetup({ chosenOpponent, onOpponentChange, venue, onVenueChange, onBack, onEditTeam }: MatchSetupProps) {
  const database = useGameStore((s) => s.database);
  const userClubId = useGameStore((s) => s.userClubId);
  const playFriendly = useGameStore((s) => s.playFriendly);
  const club = useUserClub();
  const opponents = useLeagueOpponents();
  const sheet = useTeamSheet();
  const { style } = useTacticsView();

  // Default to the dashboard's "next match" opponent.
  const defaultOpponent = useMemo(
    () => buildDashboardSummary(database, userClubId, previewDashboard).nextMatch.opponentId ?? opponents[0]?.id ?? null,
    [database, userClubId, opponents],
  );
  const opponentId = chosenOpponent ?? defaultOpponent;
  const opponentPreview = useOpponentPreview(opponentId);

  const blockingIssues = sheet.issues.filter((i) => i.severity === 'error').map((i) => i.message);
  const teamSummary = [sheet.formationId, style?.name ?? 'Custom', `avg rating ${sheet.averageRating ?? '–'}`].join(' · ');

  return (
    <MatchSetupScreen
      clubName={club?.name ?? ''}
      opponents={opponents}
      opponentId={opponentId}
      venue={venue}
      teamSummary={teamSummary}
      opponentPreview={opponentPreview}
      blockingIssues={blockingIssues}
      onOpponentChange={onOpponentChange}
      onVenueChange={onVenueChange}
      onKickOff={() => opponentId && playFriendly(opponentId, venue)}
      onEditTeam={onEditTeam}
      onBack={onBack}
    />
  );
}

function MatchCentre({ result, onPlayAgain, onDone }: { result: MatchResult; onPlayAgain: () => void; onDone: () => void }) {
  const playerName = usePlayerNames();
  const view = useMemo(
    () => ({
      timeline: buildTimeline(result, playerName),
      statRows: buildStatRows(result.stats),
      ratings: { home: buildRatingRows(result, 'home', playerName), away: buildRatingRows(result, 'away', playerName) },
      playerOfTheMatch: result.playerOfTheMatch ? playerName(result.playerOfTheMatch) : null,
    }),
    [result, playerName],
  );

  return (
    <MatchCentreScreen
      homeName={result.home.name}
      awayName={result.away.name}
      timeline={view.timeline}
      statRows={view.statRows}
      ratings={view.ratings}
      playerOfTheMatch={view.playerOfTheMatch}
      onPlayAgain={onPlayAgain}
      onDone={onDone}
    />
  );
}
