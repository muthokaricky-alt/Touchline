import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, PageHeader, Screen, SegmentedControl } from '@/components/ui';
import { spacing } from '@/theme';

import { LeagueTable } from './components/LeagueTable';
import { MatchdayCard } from './components/MatchdayCard';
import type { LeaderRowView, SeasonView } from './season-view';

type SeasonTab = 'fixtures' | 'table' | 'stats';

const SEGMENTS = [
  { value: 'fixtures', label: 'Fixtures' },
  { value: 'table', label: 'Table' },
  { value: 'stats', label: 'Stats' },
] as const satisfies readonly { value: SeasonTab; label: string }[];

/** The league season: schedule and results, standings, leaderboards. */
export function FixturesScreen({ season }: { season: SeasonView }) {
  // Local state (not a URL param) keeps the static web render and the browser in agreement.
  const [view, setView] = useState<SeasonTab>('fixtures');
  const status = season.currentMatchday === null ? 'Season complete' : `Next: matchday ${season.currentMatchday} of ${season.matchdays.length}`;

  return (
    <Screen>
      <PageHeader overline={season.competitionName} title={`Season ${season.label}`} subtitle={status} />
      <SegmentedControl segments={SEGMENTS} value={view} onChange={setView} accessibilityLabel="Season view" />

      {view === 'fixtures' ? (
        <View style={styles.columns}>
          {season.matchdays.map((day) => (
            <View key={day.matchday} style={styles.column}>
              <MatchdayCard day={day} />
            </View>
          ))}
        </View>
      ) : view === 'table' ? (
        <LeagueTable title={season.competitionName} rows={season.table} />
      ) : (
        <View style={styles.columns}>
          <View style={styles.column}>
            <LeadersCard title="Top scorers" rows={season.topScorers} unit="goals" />
          </View>
          <View style={styles.column}>
            <LeadersCard title="Most assists" rows={season.topAssists} unit="assists" />
          </View>
        </View>
      )}
    </Screen>
  );
}

function LeadersCard({ title, rows, unit }: { title: string; rows: readonly LeaderRowView[]; unit: string }) {
  return (
    <Card title={title} icon="trendUp">
      {rows.length === 0 ? (
        <AppText color="textSecondary">No {unit} yet. Play a matchday first.</AppText>
      ) : (
        rows.map((row, index) => (
          <View key={row.playerId} style={styles.leader} accessible accessibilityLabel={`${index + 1}, ${row.name}, ${row.clubShortName}, ${row.value} ${unit}`}>
            <AppText variant="bodyStrong" color="textSecondary" style={styles.rank}>
              {index + 1}
            </AppText>
            <View style={styles.leaderName}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {row.name}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                {row.clubShortName} · {row.appearances} apps
              </AppText>
            </View>
            <AppText variant="heading">{row.value}</AppText>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  // Wrapping columns (no window measuring): one column on phones, two+ on wide screens.
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, minWidth: 0 },
  leader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rank: { width: 20, textAlign: 'right' },
  leaderName: { flex: 1, minWidth: 0 },
});
