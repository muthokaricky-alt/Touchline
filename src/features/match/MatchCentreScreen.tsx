import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, IconButton, PageHeader, Screen, SegmentedControl } from '@/components/ui';
import type { MatchClock, Side } from '@/engine/types';
import { colors, spacing } from '@/theme';

import { MatchFeed } from './components/MatchFeed';
import { Pitch2D, PITCH_RATIO, type Kit } from './components/Pitch2D';
import { RatingsList } from './components/RatingsList';
import { Scoreboard } from './components/Scoreboard';
import { StatsPanel } from './components/StatsPanel';
import { phaseLabel, type RatingRow, type StatRow, type TimelineItem } from './timeline';
import { BUILD_UP_STEP_MS, type PitchFrame } from './pitch2d';
import { useMatchView, type MatchViewMode } from './use-match-view';
import { useReplay } from './use-replay';

const VIEW_SEGMENTS = [
  { value: '2d', label: '2D' },
  { value: 'commentary', label: 'Commentary' },
] as const satisfies readonly { value: MatchViewMode; label: string }[];

/** What the 2D view needs, aligned with the timeline: a frame per item and the build-up before chances and goals. */
export type MatchPitch = {
  frames: readonly (PitchFrame | undefined)[];
  buildUps: readonly (readonly PitchFrame[] | undefined)[];
  kits: Record<Side, Kit>;
  numberOf: (playerId: string) => string;
  nameOf: (playerId: string) => string;
};

/** The last moment stays on the pitch this long before the next build-up starts… */
const HOLD_MS = 700;
/** …and a goal (with its banner) this long. */
const GOAL_HOLD_MS = 2500;
/** After a build-up, a short pause before the line appears (the shot). */
const AFTER_BUILD_UP_MS = 300;

/**
 * The build-up keyframe to show while the next item is pending: -1 (keep
 * showing the last moment) for HOLD_MS, then one keyframe every
 * BUILD_UP_STEP_MS. Restarts for each new item; stops while paused.
 */
function useBuildUpStep(buildUp: readonly PitchFrame[] | undefined, playing: boolean, itemIndex: number, holdMs: number): number {
  const [step, setStep] = useState({ itemIndex, value: -1 });
  const current = step.itemIndex === itemIndex ? step.value : -1;
  useEffect(() => {
    if (!buildUp || !playing || current >= buildUp.length - 1) return;
    const timer = setTimeout(() => setStep({ itemIndex, value: current + 1 }), current < 0 ? holdMs : BUILD_UP_STEP_MS);
    return () => clearTimeout(timer);
  }, [buildUp, playing, current, itemIndex, holdMs]);
  return current;
}

type ReportView = 'timeline' | 'stats' | 'ratings';

const REPORT_SEGMENTS = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'stats', label: 'Stats' },
  { value: 'ratings', label: 'Ratings' },
] as const satisfies readonly { value: ReportView; label: string }[];

type Score = { home: number; away: number };

export type OtherResult = { key: string; homeName: string; awayName: string; score: Score; penalties?: Score };

/** "Calderbrook City win 2–1 on aggregate"; a level aggregate just states it (the penalties line says who went through). */
function aggregateLine(homeName: string, awayName: string, a: Score): string {
  if (a.home === a.away) return `${a.home}–${a.away} on aggregate`;
  return `${a.home > a.away ? homeName : awayName} win ${Math.max(a.home, a.away)}–${Math.min(a.home, a.away)} on aggregate`;
}

/** "Kestrel Bay win 4–3 on penalties" */
function penaltiesLine(homeName: string, awayName: string, p: Score): string {
  return `${p.home > p.away ? homeName : awayName} win ${Math.max(p.home, p.away)}–${Math.min(p.home, p.away)} on penalties`;
}

type MatchCentreScreenProps = {
  /** e.g. "Friendly" or "First Division · Matchday 3" */
  overline: string;
  /** Label of the primary button after full time ("Continue", "Play another"). */
  continueLabel: string;
  /** League only: the rest of the matchday, revealed at full time. */
  otherResults?: readonly OtherResult[];
  homeName: string;
  awayName: string;
  /** Cup shootout, revealed at full time. */
  penalties?: Score;
  /** Second legs: the score over both legs (home side of this match first), revealed at full time. */
  aggregate?: Score | null;
  timeline: readonly TimelineItem[];
  statRows: readonly StatRow[];
  ratings: { home: readonly RatingRow[]; away: readonly RatingRow[] };
  playerOfTheMatch: string | null;
  onPlayAgain: () => void;
  onDone: () => void;
  /**
   * Live matches only: the management panel for the moment the replay is
   * paused at. Without it the match is a plain replay.
   */
  renderManagement?: (moment: { at: MatchClock; clock: string; close: () => void }) => ReactNode;
  /** Live matches only: called once when the replay reaches full time (the match is then recorded). */
  onFullTime?: () => void;
  /** How many timeline items are already shown (a resumed match). */
  initialRevealed?: number;
  /** The 2D match view (pitch with dots); without it, commentary only. */
  pitch?: MatchPitch;
};

/**
 * Replays a finished match as a live feed, then shows the full report.
 * Give it a `key` per match so a new match restarts the replay.
 */
export function MatchCentreScreen({
  overline,
  continueLabel,
  otherResults,
  homeName,
  awayName,
  penalties,
  aggregate,
  timeline,
  statRows,
  ratings,
  playerOfTheMatch,
  onPlayAgain,
  onDone,
  renderManagement,
  onFullTime,
  initialRevealed,
  pitch,
}: MatchCentreScreenProps) {
  const matchView = useMatchView();
  const pitchOn = pitch !== undefined && matchView.mode === '2d';
  // With the pitch on, a goal stays up a while, and a chance or goal waits for its build-up before its line appears.
  const holdAfter = useCallback((index: number) => (pitchOn && pitch?.frames[index]?.goal ? GOAL_HOLD_MS : HOLD_MS), [pitchOn, pitch]);
  const stepFor = useCallback(
    (next: number) => {
      const buildUp = pitchOn ? pitch?.buildUps[next] : undefined;
      if (buildUp?.length) return holdAfter(next - 1) + buildUp.length * BUILD_UP_STEP_MS + AFTER_BUILD_UP_MS;
      return pitchOn ? holdAfter(next - 1) : 700;
    },
    [pitchOn, pitch, holdAfter],
  );
  const replay = useReplay(timeline.length, stepFor, initialRevealed);
  const [view, setView] = useState<ReportView>('timeline');
  const [managing, setManaging] = useState(false);
  // Whether the replay was running when the panel opened: closing it carries on the same way.
  const [wasPlaying, setWasPlaying] = useState(false);
  const shown = timeline.slice(0, replay.revealed);
  const current = shown.at(-1) ?? timeline[0];
  const live = renderManagement !== undefined;
  const pendingBuildUp = pitchOn && !replay.finished ? pitch?.buildUps[replay.revealed] : undefined;
  const buildUpStep = useBuildUpStep(pendingBuildUp, replay.playing && !managing, replay.revealed, holdAfter(replay.revealed - 1));
  const frame = pendingBuildUp && buildUpStep >= 0 ? pendingBuildUp[buildUpStep] : pitch?.frames[Math.max(0, replay.revealed - 1)];
  const showPitch = pitchOn && frame !== undefined;
  const goalBanner = frame?.goal
    ? {
        title: `GOAL! ${frame.goal.side === 'home' ? homeName : awayName}`,
        detail: `${current.clock} ${pitch!.nameOf(frame.goal.scorerId)}${frame.goal.assistId ? ` · assist ${pitch!.nameOf(frame.goal.assistId)}` : ''}`,
      }
    : null;

  // Full time in a live match: record it once (the report then shows the other results too).
  const recorded = useRef(false);
  useEffect(() => {
    if (replay.finished && onFullTime && !recorded.current) {
      recorded.current = true;
      onFullTime();
    }
  }, [replay.finished, onFullTime]);

  const manage = () => {
    setWasPlaying(replay.playing);
    replay.pause();
    setManaging(true);
  };
  const closeManagement = () => {
    setManaging(false);
    if (wasPlaying) replay.resume();
  };

  // Landscape during the match: the full-screen pitch (tilt the phone, or the full-screen button).
  if (showPitch && matchView.landscape && !replay.finished && !managing) {
    return (
      <FullScreenMatch
        homeName={homeName}
        awayName={awayName}
        score={current.score}
        clock={current.clock}
        caption={current.text}
        status={!replay.playing ? 'Paused' : phaseLabel(current.phase)}
        playing={replay.playing}
        onTogglePlaying={replay.togglePlaying}
        onSkip={replay.skipToEnd}
        onManage={live ? manage : undefined}
        onExit={matchView.exitFullScreen}>
        <Pitch2D frame={frame!} kits={pitch!.kits} numberOf={pitch!.numberOf} goalBanner={goalBanner} />
      </FullScreenMatch>
    );
  }

  return (
    <Screen bottomInset>
      <PageHeader
        overline={overline}
        title={replay.finished ? 'Match report' : 'Match centre'}
        // A live match can't be left half-played: it's recorded at full time.
        leading={live && !replay.finished ? undefined : <IconButton icon="back" accessibilityLabel="Back" onPress={onDone} />}
      />
      <Scoreboard
        homeName={homeName}
        awayName={awayName}
        score={current.score}
        clock={current.clock}
        status={!replay.finished && !replay.playing ? 'Paused' : phaseLabel(current.phase)}
        live={replay.playing && current.phase !== 'half-time'}
      />

      {!replay.finished && managing && renderManagement ? (
        renderManagement({ at: current.at, clock: current.clock, close: closeManagement })
      ) : !replay.finished ? (
        <>
          {pitch ? (
            <View style={styles.viewRow}>
              <View style={styles.flex}>
                <SegmentedControl segments={VIEW_SEGMENTS} value={matchView.mode} onChange={matchView.setMode} accessibilityLabel="Match view" />
              </View>
              {showPitch ? (
                <IconButton icon="fullscreen" accessibilityLabel="Full screen" onPress={matchView.enterFullScreen} />
              ) : null}
            </View>
          ) : null}
          {showPitch ? <Pitch2D frame={frame!} kits={pitch!.kits} numberOf={pitch!.numberOf} goalBanner={goalBanner} /> : null}
          {live ? <Button label="Manage team" icon="tactics" variant="secondary" onPress={manage} accessibilityHint="Pauses the match: substitutions and instructions" /> : null}
          <View style={styles.controls}>
            <View style={styles.flex}>
              <Button
                label={replay.playing ? 'Pause' : 'Resume'}
                variant="secondary"
                onPress={replay.togglePlaying}
              />
            </View>
            <View style={styles.flex}>
              <Button label="Skip to full time" onPress={replay.skipToEnd} />
            </View>
          </View>
          <Card title="Live" icon="match">
            <MatchFeed items={shown} newestFirst />
          </Card>
        </>
      ) : (
        <>
          {aggregate ? (
            <AppText variant="heading" color="accent" align="center" accessibilityLiveRegion="polite">
              {aggregateLine(homeName, awayName, aggregate)}
            </AppText>
          ) : null}
          {penalties ? (
            <AppText variant="heading" color="accent" align="center" accessibilityLiveRegion="polite">
              {penaltiesLine(homeName, awayName, penalties)}
            </AppText>
          ) : null}
          {playerOfTheMatch ? (
            <AppText color="textSecondary" align="center">
              Player of the match: <AppText variant="bodyStrong">{playerOfTheMatch}</AppText>
            </AppText>
          ) : null}
          {otherResults && otherResults.length > 0 ? (
            <Card title="Other results" icon="fixtures">
              {otherResults.map((r) => (
                <View key={r.key} style={styles.result} accessible accessibilityLabel={`${r.homeName} ${r.score.home}, ${r.awayName} ${r.score.away}`}>
                  <AppText style={styles.resultTeam} numberOfLines={1} align="right">
                    {r.homeName}
                  </AppText>
                  <AppText variant="bodyStrong" style={styles.resultScore}>
                    {r.score.home} – {r.score.away}
                    {r.penalties ? ` (${r.penalties.home}–${r.penalties.away}p)` : ''}
                  </AppText>
                  <AppText style={styles.resultTeam} numberOfLines={1}>
                    {r.awayName}
                  </AppText>
                </View>
              ))}
            </Card>
          ) : null}
          <SegmentedControl segments={REPORT_SEGMENTS} value={view} onChange={setView} accessibilityLabel="Match report" />
          {view === 'timeline' ? (
            <Card>
              <MatchFeed items={timeline} />
            </Card>
          ) : view === 'stats' ? (
            <Card title={`${homeName} v ${awayName}`}>
              <StatsPanel rows={statRows} />
            </Card>
          ) : (
            <View style={styles.columns}>
              <Card title={homeName} style={styles.column}>
                <RatingsList rows={ratings.home} />
              </Card>
              <Card title={awayName} style={styles.column}>
                <RatingsList rows={ratings.away} />
              </Card>
            </View>
          )}
          <View style={styles.controls}>
            <View style={styles.flex}>
              <Button label="Done" variant="secondary" onPress={onDone} />
            </View>
            <View style={styles.flex}>
              <Button label={continueLabel} icon="match" onPress={onPlayAgain} />
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}

type FullScreenMatchProps = {
  homeName: string;
  awayName: string;
  score: Score;
  clock: string;
  caption: string;
  status: string;
  playing: boolean;
  onTogglePlaying: () => void;
  onSkip: () => void;
  onManage?: () => void;
  onExit: () => void;
  children: ReactNode;
};

/**
 * Landscape: the pitch as large as the screen allows (keeping its
 * proportions), a slim scoreboard, the latest commentary line as a caption,
 * and the replay controls.
 */
function FullScreenMatch({ homeName, awayName, score, clock, caption, status, playing, onTogglePlaying, onSkip, onManage, onExit, children }: FullScreenMatchProps) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  const pitchWidth = Math.min(area.width, area.height * PITCH_RATIO);

  return (
    <SafeAreaView style={styles.fullScreen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.fullTopBar}>
        <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex} accessibilityLiveRegion="polite">
          {homeName} {score.home} – {score.away} {awayName}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {clock} · {status}
        </AppText>
        <IconButton icon="exitFullscreen" accessibilityLabel="Exit full screen" onPress={onExit} />
      </View>
      <View style={styles.fullPitchArea} onLayout={onLayout}>
        {pitchWidth > 0 ? <View style={{ width: pitchWidth }}>{children}</View> : null}
      </View>
      <View style={styles.fullBottomBar}>
        <AppText numberOfLines={2} style={styles.flex}>
          {caption}
        </AppText>
        {onManage ? <Button label="Manage" variant="secondary" icon="tactics" onPress={onManage} /> : null}
        <Button label={playing ? 'Pause' : 'Resume'} variant="secondary" onPress={onTogglePlaying} />
        <Button label="Skip" onPress={onSkip} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fullScreen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md, gap: spacing.sm },
  fullTopBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.xs },
  fullPitchArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fullBottomBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.xs },
  controls: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, minWidth: 0 },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  resultTeam: { flex: 1 },
  resultScore: { minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
