import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui';
import { spacing } from '@/theme';

import { ClubHeader } from './components/ClubHeader';
import { FinanceCard } from './components/FinanceCard';
import { InboxCard } from './components/InboxCard';
import { LeagueSnapshotCard } from './components/LeagueSnapshotCard';
import { NextMatchCard } from './components/NextMatchCard';
import { SquadStatusCard } from './components/SquadStatusCard';
import type { DashboardSummary } from './dashboard.types';

type DashboardScreenProps = { summary: DashboardSummary };

/**
 * Manager's home screen. Receives a ready-made `DashboardSummary` and only
 * arranges cards: no game logic lives here.
 *
 * Layout: two columns that wrap into one on narrow screens. We use flex-wrap
 * instead of measuring the window width so the statically pre-rendered web
 * HTML matches what the browser renders (no hydration mismatch).
 */
export function DashboardScreen({ summary }: DashboardScreenProps) {
  const router = useRouter();
  const primary = (
    <>
      <NextMatchCard
        club={summary.club}
        clubForm={summary.form}
        match={summary.nextMatch}
        onViewFixtures={() => router.navigate('/fixtures')}
      />
      <LeagueSnapshotCard leagueName={summary.club.leagueName} table={summary.table} clubId={summary.club.id} />
    </>
  );
  const secondary = (
    <>
      <SquadStatusCard squad={summary.squad} />
      <InboxCard messages={summary.inbox} />
      <FinanceCard finances={summary.finances} />
    </>
  );

  return (
    <Screen>
      <ClubHeader manager={summary.manager} club={summary.club} season={summary.season} />
      <View style={styles.columns}>
        <View style={styles.column}>{primary}</View>
        <View style={styles.column}>{secondary}</View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  // Two 340px columns + gap need ~700px; below that they wrap to one column.
  column: { flexGrow: 1, flexBasis: 340, gap: spacing.lg, minWidth: 0 },
});
