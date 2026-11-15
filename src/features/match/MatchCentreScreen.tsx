import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, IconButton, PageHeader, Screen, SegmentedControl } from '@/components/ui';
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

export type OtherResult = { key: string; homeName: string; awayName: string; score: { home: number; away: number } };

type MatchCentreScreenProps = {
  /** e.g. "Friendly" or "First Division · Matchday 3" */
  overline: string;
  /** Label of the primary button after full time ("Continue", "Play another"). */
  continueLabel: string;
  /** League only: the rest of the matchday, revealed at full time. */
  otherResults?: readonly OtherResult[];
  homeName: string;
  awayName: string;
  timeline: readonly TimelineItem[];
  statRows: readonly StatRow[];
  ratings: { home: readonly RatingRow[]; away: readonly RatingRow[] };
  playerOfTheMatch: string | null;
  onPlayAgain: () => void;
  onDone: () => void;
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
  timeline,
  statRows,
  ratings,
  playerOfTheMatch,
  onPlayAgain,
  onDone,
}: MatchCentreScreenProps) {
  const replay = useReplay(timeline.length);
  const [view, setView] = useState<ReportView>('timeline');
  const shown = timeline.slice(0, replay.revealed);
  const current = shown.at(-1) ?? timeline[0];

  return (
    <Screen bottomInset>
      <PageHeader
        overline={overline}
        title={replay.finished ? 'Match report' : 'Match centre'}
        leading={<IconButton icon="back" accessibilityLabel="Back" onPress={onDone} />}
      />
      <Scoreboard
        homeName={homeName}
        awayName={awayName}
        score={current.score}
        clock={current.clock}
        status={!replay.finished && !replay.playing ? 'Paused' : phaseLabel(current.phase)}
        live={replay.playing && current.phase !== 'half-time'}
      />

      {!replay.finished ? (
        <>
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
