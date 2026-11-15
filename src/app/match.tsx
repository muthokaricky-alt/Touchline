import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import type { ClubId } from '@/data/schemas';
import type { MatchResult } from '@/engine/types';
import { FixtureSetupScreen } from '@/features/match/FixtureSetupScreen';
import { MatchCentreScreen, type OtherResult } from '@/features/match/MatchCentreScreen';
import { MatchSetupScreen } from '@/features/match/MatchSetupScreen';
import { buildRatingRows, buildStatRows, buildTimeline } from '@/features/match/timeline';
import type { MatchVenue } from '@/game/match/friendly';
import { findClub } from '@/game/squad/squad-selectors';
import { useGameStore } from '@/store/game-store';
import {
  useLeagueOpponents,
  useNextFixture,
  useOpponentPreview,
  usePlayerNames,
  useTacticsView,
  useTeamSheet,
  useUserClub,
} from '@/store/hooks';

/**
 * Route: match day. State decides what shows (no URL params, so the static
 * web export's pre-rendered page matches the browser's first render):
 *
 *   lastMatch set              → match centre (replay, then report)
 *   else, league fixture due   → fixture pre-match (unless the user chose a friendly)
 *   else                       → friendly setup
 */
export default function MatchRoute() {
  const router = useRouter();
  const lastMatch = useGameStore((s) => s.lastMatch);
  const lastMatchFixtureId = useGameStore((s) => s.lastMatchFixtureId);
  const clearMatch = useGameStore((s) => s.clearMatch);
  const nextFixture = useNextFixture();

  // Held here (not in the setup screens) so choices survive the match centre.
  const [wantsFriendly, setWantsFriendly] = useState(false);
  const [chosenOpponent, setChosenOpponent] = useState<ClubId | null>(null);
  const [venue, setVenue] = useState<MatchVenue>('home');

  const done = () => {
    clearMatch();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const editTeam = () => router.navigate('/tactics');

  if (lastMatch) {
    return (
      <MatchCentre
        // A new match remounts the centre, restarting the replay.
        key={`${lastMatch.seed}-${lastMatch.home.clubId}-${lastMatch.away.clubId}`}
        result={lastMatch}
        fixtureId={lastMatchFixtureId}
        // After the final league match there's nothing left to set up: go to the dashboard's season summary.
        onContinue={lastMatchFixtureId && !nextFixture ? done : clearMatch}
        onDone={done}
      />
    );
  }
  if (nextFixture && !wantsFriendly) {
    return <LeagueSetup onPlayFriendly={() => setWantsFriendly(true)} onEditTeam={editTeam} onBack={done} />;
  }
  return (
    <FriendlySetup
      chosenOpponent={chosenOpponent}
      onOpponentChange={setChosenOpponent}
      venue={venue}
      onVenueChange={setVenue}
      onBack={done}
      onEditTeam={editTeam}
      onBackToLeague={nextFixture ? () => setWantsFriendly(false) : undefined}
    />
  );
}

/** Formation · style · rating line and lineup errors, shared by both setups. */
function useTeamReadiness() {
  const sheet = useTeamSheet();
  const { style } = useTacticsView();
  return {
    teamSummary: [sheet.formationId, style?.name ?? 'Custom', `avg rating ${sheet.averageRating ?? '–'}`].join(' · '),
    blockingIssues: sheet.issues.filter((i) => i.severity === 'error').map((i) => i.message),
  };
}

function LeagueSetup({ onPlayFriendly, onEditTeam, onBack }: { onPlayFriendly: () => void; onEditTeam: () => void; onBack: () => void }) {
  const fixture = useNextFixture();
  const playNextFixture = useGameStore((s) => s.playNextFixture);
  const opponentPreview = useOpponentPreview(fixture?.opponentId ?? null);
  const { teamSummary, blockingIssues } = useTeamReadiness();
  if (!fixture) return null;

  return (
    <FixtureSetupScreen
      competitionName={fixture.competitionName}
      matchday={fixture.matchday}
      totalMatchdays={fixture.totalMatchdays}
      date={fixture.date}
      homeName={fixture.homeName}
      awayName={fixture.awayName}
      userIsHome={fixture.venue === 'home'}
      teamSummary={teamSummary}
      opponentPreview={opponentPreview}
      blockingIssues={blockingIssues}
      onKickOff={playNextFixture}
      onEditTeam={onEditTeam}
      onPlayFriendly={onPlayFriendly}
      onBack={onBack}
    />
  );
}

type FriendlySetupProps = {
  chosenOpponent: ClubId | null;
  onOpponentChange: (id: ClubId) => void;
  venue: MatchVenue;
  onVenueChange: (venue: MatchVenue) => void;
  onBack: () => void;
  onEditTeam: () => void;
  onBackToLeague?: () => void;
};

function FriendlySetup({ chosenOpponent, onOpponentChange, venue, onVenueChange, onBack, onEditTeam, onBackToLeague }: FriendlySetupProps) {
  const playFriendly = useGameStore((s) => s.playFriendly);
  const club = useUserClub();
  const opponents = useLeagueOpponents();
  const nextFixture = useNextFixture();
  // Default: the next league opponent, else the strongest club.
  const opponentId = chosenOpponent ?? nextFixture?.opponentId ?? opponents[0]?.id ?? null;
  const opponentPreview = useOpponentPreview(opponentId);
  const { teamSummary, blockingIssues } = useTeamReadiness();

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
      onBackToLeague={onBackToLeague}
    />
  );
}

type MatchCentreProps = {
  result: MatchResult;
  /** Set for league matches. */
  fixtureId: string | null;
  onContinue: () => void;
  onDone: () => void;
};

function MatchCentre({ result, fixtureId, onContinue, onDone }: MatchCentreProps) {
  const playerName = usePlayerNames();
  const database = useGameStore((s) => s.database);
  const season = useGameStore((s) => s.season);

  const view = useMemo(() => {
    const fixture = fixtureId ? season.fixtures.find((f) => f.id === fixtureId) : undefined;
    const league = fixture ? database.competitions.find((c) => c.id === fixture.competitionId) : undefined;
    const otherResults: OtherResult[] = fixture
      ? season.fixtures
          .filter((f) => f.matchday === fixture.matchday && f.id !== fixture.id && f.result)
          .map((f) => ({
            key: f.id,
            homeName: findClub(database, f.homeId)?.name ?? f.homeId,
            awayName: findClub(database, f.awayId)?.name ?? f.awayId,
            score: f.result!.score,
          }))
      : [];
    return {
      overline: fixture && league ? `${league.name} · Matchday ${fixture.matchday}` : 'Friendly',
      otherResults,
      timeline: buildTimeline(result, playerName),
      statRows: buildStatRows(result.stats),
      ratings: { home: buildRatingRows(result, 'home', playerName), away: buildRatingRows(result, 'away', playerName) },
      playerOfTheMatch: result.playerOfTheMatch ? playerName(result.playerOfTheMatch) : null,
    };
  }, [result, fixtureId, season, database, playerName]);

  return (
    <MatchCentreScreen
      overline={view.overline}
      continueLabel={fixtureId ? 'Continue' : 'Play another'}
      otherResults={view.otherResults}
      homeName={result.home.name}
      awayName={result.away.name}
      timeline={view.timeline}
      statRows={view.statRows}
      ratings={view.ratings}
      playerOfTheMatch={view.playerOfTheMatch}
      onPlayAgain={onContinue}
      onDone={onDone}
    />
  );
}
