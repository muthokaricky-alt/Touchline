import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { AppText, Button, PageHeader, Screen } from '@/components/ui';
import type { ClubId } from '@/data/schemas';
import { clockKey } from '@/engine/simulate';
import type { MatchResult } from '@/engine/types';
import { MatchManagementPanel, type ManagedPlayer } from '@/features/match/components/MatchManagementPanel';
import { FixtureSetupScreen } from '@/features/match/FixtureSetupScreen';
import { matchKits } from '@/features/match/kits';
import { MatchCentreScreen, type MatchPitch, type OtherResult } from '@/features/match/MatchCentreScreen';
import { buildBuildUps, buildPitchFrames } from '@/features/match/pitch2d';
import { MatchSetupScreen } from '@/features/match/MatchSetupScreen';
import { buildRatingRows, buildStatRows, buildTimeline } from '@/features/match/timeline';
import type { MatchVenue } from '@/game/match/friendly';
import { resumeClock, snapshotAt, type LiveMatch, type LiveView, type UserChange } from '@/game/match/live';
import { tieAggregate } from '@/game/season/cup';
import { competitionName, roundLabel } from '@/game/season/season-flow';
import { findClub } from '@/game/squad/squad-selectors';
import { useGameStore } from '@/store/game-store';
import {
  useLiveMatch,
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
 *   match in progress          → live match centre (replay + in-match changes)
 *   lastMatch set              → match centre (report of the finished match)
 *   else, league fixture due   → fixture pre-match (unless the user chose a friendly)
 *   else                       → friendly setup
 *
 * A live match and its finished report are the same MatchCentre (same key),
 * so the replay carries straight on into the report at full time.
 */
export default function MatchRoute() {
  const router = useRouter();
  const lastMatch = useGameStore((s) => s.lastMatch);
  const lastMatchFixtureId = useGameStore((s) => s.lastMatchFixtureId);
  const liveMatch = useGameStore((s) => s.liveMatch);
  const live = useLiveMatch();
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

  if (liveMatch && !live) return <BrokenLiveMatch />;
  if (live) {
    const { result } = live.view;
    return (
      <MatchCentre
        key={`${result.seed}-${result.home.clubId}-${result.away.clubId}`}
        result={result}
        fixtureId={live.view.fixtureId}
        live={live}
        onContinue={clearMatch}
        onDone={done}
      />
    );
  }
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

/**
 * Formation · style · rating line and lineup errors, shared by both setups.
 * Suspensions only apply to competitive fixtures, so they don't block a friendly.
 */
function useTeamReadiness(kind: 'fixture' | 'friendly') {
  const sheet = useTeamSheet();
  const { style } = useTacticsView();
  return {
    teamSummary: [sheet.formationId, style?.name ?? 'Custom', `avg rating ${sheet.averageRating ?? '–'}`].join(' · '),
    blockingIssues: sheet.issues
      .filter((i) => i.severity === 'error' && !(kind === 'friendly' && i.code === 'suspended'))
      .map((i) => i.message),
  };
}

function LeagueSetup({ onPlayFriendly, onEditTeam, onBack }: { onPlayFriendly: () => void; onEditTeam: () => void; onBack: () => void }) {
  const fixture = useNextFixture();
  const kickOff = useGameStore((s) => s.kickOff);
  const opponentPreview = useOpponentPreview(fixture?.opponentId ?? null);
  const { teamSummary, blockingIssues } = useTeamReadiness('fixture');
  if (!fixture) return null;

  return (
    <FixtureSetupScreen
      competitionName={fixture.competitionName}
      roundLabel={fixture.roundLabel}
      isCup={fixture.isCup}
      penalties={fixture.penalties}
      firstLeg={fixture.firstLeg}
      date={fixture.date}
      homeName={fixture.homeName}
      awayName={fixture.awayName}
      userIsHome={fixture.venue === 'home'}
      teamSummary={teamSummary}
      opponentPreview={opponentPreview}
      blockingIssues={blockingIssues}
      onKickOff={kickOff}
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
  const kickOffFriendly = useGameStore((s) => s.kickOffFriendly);
  const club = useUserClub();
  const opponents = useLeagueOpponents();
  const nextFixture = useNextFixture();
  // Default: the next league opponent, else the strongest club.
  const opponentId = chosenOpponent ?? nextFixture?.opponentId ?? opponents[0]?.id ?? null;
  const opponentPreview = useOpponentPreview(opponentId);
  const { teamSummary, blockingIssues } = useTeamReadiness('friendly');

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
      onKickOff={() => opponentId && kickOffFriendly(opponentId, venue)}
      onEditTeam={onEditTeam}
      onBack={onBack}
      onBackToLeague={onBackToLeague}
    />
  );
}

/** A saved match in progress that no longer fits the career (shouldn't happen: the save check guards it). */
function BrokenLiveMatch() {
  const abandon = useGameStore((s) => s.abandonMatch);
  return (
    <Screen bottomInset>
      <PageHeader title="Match unavailable" />
      <AppText color="textSecondary">The match in progress couldn’t be restored. It hasn’t been recorded: you can play it again.</AppText>
      <Button label="Back to the dashboard" onPress={abandon} />
    </Screen>
  );
}

type MatchCentreProps = {
  result: MatchResult;
  /** Set for league matches. */
  fixtureId: string | null;
  /** Set while the match is in progress (changes possible). */
  live?: { live: LiveMatch; view: LiveView };
  onContinue: () => void;
  onDone: () => void;
};

function MatchCentre({ result, fixtureId, live, onContinue, onDone }: MatchCentreProps) {
  const playerName = usePlayerNames();
  const database = useGameStore((s) => s.database);
  const season = useGameStore((s) => s.season);
  const finishMatch = useGameStore((s) => s.finishMatch);
  const makeMatchChange = useGameStore((s) => s.makeMatchChange);
  const onFullTime = useCallback(() => {
    finishMatch();
  }, [finishMatch]);

  const view = useMemo(() => {
    const fixture = fixtureId ? season.fixtures.find((f) => f.id === fixtureId) : undefined;
    // Same competition AND same round: matchday 3 exists in both leagues and the cup.
    const otherResults: OtherResult[] = fixture
      ? season.fixtures
          .filter((f) => f.competitionId === fixture.competitionId && f.matchday === fixture.matchday && f.id !== fixture.id && f.result)
          .map((f) => ({
            key: f.id,
            homeName: findClub(database, f.homeId)?.name ?? f.homeId,
            awayName: findClub(database, f.awayId)?.name ?? f.awayId,
            score: f.result!.score,
            penalties: f.result!.penalties,
          }))
      : [];
    // The 2D view: a frame per commentary item (keys are event indexes), club colours, shirt numbers.
    const timeline = buildTimeline(result, playerName);
    const frames = buildPitchFrames(result);
    const buildUps = buildBuildUps(result);
    const colours = (id: ClubId) => findClub(database, id)?.colours ?? { primary: '#FFFFFF', secondary: '#101820' };
    const numbers = new Map(database.contracts.map((c) => [c.playerId, String(c.squadNumber)]));
    const pitch: MatchPitch = {
      frames: timeline.map((item) => frames.get(Number(item.key))),
      buildUps: timeline.map((item) => buildUps.get(Number(item.key))),
      kits: matchKits(colours(result.home.clubId), colours(result.away.clubId)),
      numberOf: (id) => numbers.get(id) ?? '',
      nameOf: playerName,
    };
    return {
      overline: fixture ? `${competitionName(database, fixture.competitionId)} · ${roundLabel(season, fixture)}` : 'Friendly',
      // A second leg: the first leg is in the season's results already, live or finished.
      aggregate: fixture ? tieAggregate(season, fixture, result.score) : null,
      otherResults,
      timeline,
      statRows: buildStatRows(result.stats),
      ratings: { home: buildRatingRows(result, 'home', playerName), away: buildRatingRows(result, 'away', playerName) },
      playerOfTheMatch: result.playerOfTheMatch ? playerName(result.playerOfTheMatch) : null,
      pitch,
    };
  }, [result, fixtureId, season, database, playerName]);

  // A resumed match starts where the last change was made (fixed at mount).
  const [initialRevealed] = useState(() => {
    if (!live) return undefined;
    const resume = clockKey(resumeClock(live.live));
    return view.timeline.filter((item) => clockKey(item.at) <= resume).length;
  });

  const renderManagement = live
    ? ({ at, clock, close }: { at: Parameters<typeof snapshotAt>[1]; clock: string; close: () => void }) => {
        const team = snapshotAt(live.view, at).teams[live.view.side];
        const attempt = (change: UserChange) => {
          try {
            makeMatchChange(at, change);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        };
        const onPitch: ManagedPlayer[] = team.onPitch
          .filter((p) => p.position !== 'GK')
          .map((p) => ({ id: p.id, name: playerName(p.id), position: p.position, detail: `${p.energy}% energy${p.booked ? ' · booked' : ''}` }));
        const keeper = team.onPitch.find((p) => p.position === 'GK');
        const bench: ManagedPlayer[] = team.bench.map((id) => {
          const c = live.view.input[live.view.side].squad.find((x) => x.player.id === id);
          return { id, name: playerName(id), position: c?.player.primaryPosition ?? 'CM', detail: 'Substitute' };
        });
        return (
          <MatchManagementPanel
            clock={clock}
            subsLeft={team.subsLeft}
            onPitch={keeper ? [{ id: keeper.id, name: playerName(keeper.id), position: 'GK', detail: `${keeper.energy}% energy` }, ...onPitch] : onPitch}
            bench={bench}
            tactics={team.tactics}
            inCharge={team.manual}
            onSubstitute={(offId, onId) => attempt({ kind: 'substitution', offId, onId })}
            onApplyTactics={(tactics) => attempt({ kind: 'tactics', tactics })}
            onClose={close}
          />
        );
      }
    : undefined;

  return (
    <MatchCentreScreen
      overline={view.overline}
      continueLabel={fixtureId ? 'Continue' : 'Play another'}
      otherResults={view.otherResults}
      homeName={result.home.name}
      awayName={result.away.name}
      penalties={result.penalties}
      aggregate={view.aggregate}
      timeline={view.timeline}
      statRows={view.statRows}
      ratings={view.ratings}
      playerOfTheMatch={view.playerOfTheMatch}
      onPlayAgain={onContinue}
      onDone={onDone}
      renderManagement={renderManagement}
      onFullTime={live ? onFullTime : undefined}
      initialRevealed={initialRevealed}
      pitch={view.pitch}
    />
  );
}
