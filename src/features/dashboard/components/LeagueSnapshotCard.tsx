import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { formatGoalDifference } from '@/utils/format';

import type { LeagueTableRow } from '../dashboard.types';
import { getTableWindow } from '../table-window';

type LeagueSnapshotCardProps = {
  leagueName: string;
  table: readonly LeagueTableRow[];
  clubId: string;
};

const WINDOW_SIZE = 5;

export function LeagueSnapshotCard({ leagueName, table, clubId }: LeagueSnapshotCardProps) {
  const rows = getTableWindow(table, clubId, WINDOW_SIZE);

  return (
    <Card title={leagueName} icon="table">
      <View style={styles.headerRow}>
        <AppText variant="overline" color="textMuted" style={styles.pos}>#</AppText>
        <AppText variant="overline" color="textMuted" style={styles.club}>Club</AppText>
        <AppText variant="overline" color="textMuted" style={styles.num}>P</AppText>
        <AppText variant="overline" color="textMuted" style={styles.num}>GD</AppText>
        <AppText variant="overline" color="textMuted" style={styles.num}>Pts</AppText>
      </View>
      {rows.map((row) => {
        const isUser = row.clubId === clubId;
        return (
          <View
            key={row.clubId}
            style={[styles.row, isUser && styles.userRow]}
            accessible
            accessibilityLabel={`${row.position}, ${row.clubName}, ${row.points} points${isUser ? ', your club' : ''}`}>
            <AppText variant="bodyStrong" color={isUser ? 'accent' : 'textSecondary'} style={styles.pos}>
              {row.position}
            </AppText>
            <AppText variant={isUser ? 'bodyStrong' : 'body'} numberOfLines={1} style={styles.club}>
              {row.clubName}
            </AppText>
            <AppText variant="caption" color="textSecondary" style={styles.num}>
              {row.played}
            </AppText>
            <AppText variant="caption" color="textSecondary" style={styles.num}>
              {formatGoalDifference(row.goalDifference)}
            </AppText>
            <AppText variant="bodyStrong" style={styles.num}>
              {row.points}
            </AppText>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', paddingHorizontal: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  userRow: { backgroundColor: colors.accentMuted },
  pos: { width: 28 },
  club: { flex: 1, minWidth: 0 },
  num: { width: 40, textAlign: 'right' },
});
