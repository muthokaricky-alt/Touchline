import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import type { TableZone } from '@/game/season/table';
import { colors, radii, spacing } from '@/theme';
import { formatGoalDifference } from '@/utils/format';

import type { TableRowView } from '../season-view';

const ZONE_COLOR: Record<TableZone, string> = {
  champion: colors.accent,
  promotion: colors.info,
  relegation: colors.danger,
};

const ZONE_NAME: Record<TableZone, string> = { champion: 'champions', promotion: 'promotion', relegation: 'relegation' };

const COLUMNS = ['P', 'W', 'D', 'L', 'GD', 'Pts'] as const;

/**
 * Full league table. A coloured bar marks zones, with a text legend (colour
 * isn't the only signal). `zoneNames` renames zones (a group's "promotion"
 * zone is "Round of 16").
 */
export function LeagueTable({
  title,
  rows,
  zoneNames,
}: {
  title: string;
  rows: readonly TableRowView[];
  zoneNames?: Partial<Record<TableZone, string>>;
}) {
  const zoneName = (z: TableZone) => zoneNames?.[z] ?? ZONE_NAME[z];
  const zones = [...new Set(rows.map((r) => r.zone).filter((z): z is TableZone => z !== null))];
  return (
    <Card title={title} icon="table">
      <View style={styles.row}>
        <View style={styles.bar} />
        <AppText variant="overline" color="textMuted" style={styles.pos}>#</AppText>
        <AppText variant="overline" color="textMuted" style={styles.club}>Club</AppText>
        {COLUMNS.map((c) => (
          <AppText key={c} variant="overline" color="textMuted" style={styles.num}>
            {c}
          </AppText>
        ))}
      </View>
      {rows.map((row) => (
        <View
          key={row.clubId}
          style={[styles.row, row.isUser && styles.userRow]}
          accessible
          accessibilityLabel={`${row.position}, ${row.clubName}, played ${row.played}, ${row.points} points, goal difference ${row.goalDifference}${row.zone ? `, ${zoneName(row.zone)} zone` : ''}${row.isUser ? ', your club' : ''}`}>
          <View style={[styles.bar, row.zone && { backgroundColor: ZONE_COLOR[row.zone] }]} />
          <AppText variant="bodyStrong" color={row.isUser ? 'accent' : 'textSecondary'} style={styles.pos}>
            {row.position}
          </AppText>
          <AppText variant={row.isUser ? 'bodyStrong' : 'body'} numberOfLines={1} style={styles.club}>
            {row.clubName}
          </AppText>
          {[row.played, row.won, row.drawn, row.lost].map((value, i) => (
            <AppText key={COLUMNS[i]} variant="caption" color="textSecondary" style={styles.num}>
              {value}
            </AppText>
          ))}
          <AppText variant="caption" color="textSecondary" style={styles.num}>
            {formatGoalDifference(row.goalDifference)}
          </AppText>
          <AppText variant="bodyStrong" style={styles.num}>
            {row.points}
          </AppText>
        </View>
      ))}
      {zones.length > 0 ? (
        <View style={styles.legend}>
          {zones.map((z) => (
            <View key={z} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: ZONE_COLOR[z] }]} />
              <AppText variant="caption" color="textSecondary">
                {zoneName(z).charAt(0).toUpperCase() + zoneName(z).slice(1)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, paddingRight: spacing.xs, borderRadius: radii.sm },
  userRow: { backgroundColor: colors.accentMuted },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: radii.pill, marginRight: spacing.sm },
  pos: { width: 22 },
  club: { flex: 1, minWidth: 0 },
  num: { width: 30, textAlign: 'right' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 10, height: 10, borderRadius: radii.sm },
});
