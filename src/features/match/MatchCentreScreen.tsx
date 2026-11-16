import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, IconButton, PageHeader, Screen, SegmentedControl } from '@/components/ui';
import type { MatchClock } from '@/engine/types';
import { spacing } from '@/theme';

import { MatchFeed } from './components/MatchFeed';
import { RatingsList } from './components/RatingsList';
import { Scoreboard } from './components/Scoreboard';
import { StatsPanel } from './components/StatsPanel';
import { phaseLabel, type RatingRow, type StatRow, type TimelineItem } from './timeline';
import { useReplay } from './use-replay';

type ReportView = 'timeline' | 'stats' | 'ratings';

const REPORT_SEGMENTS = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'stats', label: 'Stats' },
  { value: 'ratings', label: 'Ratings' },
] as const satisfies readonly { value: ReportView; label: string }[];

type Score = { home: number; away: number };

export type OtherResult = { key: string; homeName: string; awayName: string; score: Score; penalties?: Score };

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
  timeline,
  statRows,
  ratings,
  playerOfTheMatch,
  onPlayAgain,
  onDone,
  renderManagement,
  onFullTime,
  initialRevealed,
}: MatchCentreScreenProps) {
  const replay = useReplay(timeline.length, undefined, initialRevealed);
  const [view, setView] = useState<ReportView>('timeline');
  const [managing, setManaging] = useState(false);
  // Whether the replay was running when the panel opened: closing it carries on the same way.
  const [wasPlaying, setWasPlaying] = useState(false);
  const shown = timeline.slice(0, replay.revealed);
  const current = shown.at(-1) ?? timeline[0];
  const live = renderManagement !== undefined;

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

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, minWidth: 0 },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  resultTeam: { flex: 1 },
  resultScore: { minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
