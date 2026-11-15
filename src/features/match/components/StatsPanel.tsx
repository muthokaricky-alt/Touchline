import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import type { StatRow } from '../timeline';

/** Home value · label · away value, with a split bar underneath. */
export function StatsPanel({ rows }: { rows: readonly StatRow[] }) {
  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <View
          key={row.label}
          style={styles.row}
          accessible
          accessibilityLabel={`${row.label}: home ${row.home}, away ${row.away}`}>
          <View style={styles.values}>
            <AppText variant="bodyStrong" style={styles.value}>
              {row.home}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {row.label}
            </AppText>
            <AppText variant="bodyStrong" style={[styles.value, styles.right]}>
              {row.away}
            </AppText>
          </View>
          <View style={styles.bar}>
            <View style={[styles.home, { flex: row.homeShare }]} />
            <View style={[styles.away, { flex: 1 - row.homeShare }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: { gap: spacing.xs },
  values: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { minWidth: 48, fontVariant: ['tabular-nums'] },
  right: { textAlign: 'right' },
  bar: { flexDirection: 'row', height: 6, borderRadius: radii.pill, overflow: 'hidden', gap: 2 },
  home: { backgroundColor: colors.accent },
  away: { backgroundColor: colors.info },
});
