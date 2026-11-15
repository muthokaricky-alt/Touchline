import { StyleSheet, View } from 'react-native';

import { AppText, ListRow, Pill, PositionBadge } from '@/components/ui';
import { colors, radii, spacing, type ColorToken } from '@/theme';

import type { MatchRatingTone, RatingRow } from '../timeline';

const TONE_COLOR: Record<MatchRatingTone, ColorToken> = {
  excellent: 'accent',
  good: 'textPrimary',
  average: 'textSecondary',
  poor: 'danger',
};

function summary(row: RatingRow): string {
  const parts = [row.started ? `${row.minutes}'` : `Sub, ${row.minutes}'`];
  if (row.goals) parts.push(row.goals === 1 ? '1 goal' : `${row.goals} goals`);
  if (row.assists) parts.push(row.assists === 1 ? '1 assist' : `${row.assists} assists`);
  if (row.card) parts.push(row.card === 'red' ? 'sent off' : 'booked');
  return parts.join(' · ');
}

/** One team's players with match ratings (3–10). */
export function RatingsList({ rows }: { rows: readonly RatingRow[] }) {
  return (
    <View>
      {rows.map((row, index) => (
        <ListRow
          key={row.id}
          divider={index > 0}
          title={row.name}
          subtitle={summary(row)}
          leading={<PositionBadge position={row.position} />}
          trailing={
            <View style={styles.trailing}>
              {row.playerOfTheMatch ? <Pill label="POTM" tone="accent" /> : null}
              <View style={styles.badge} accessible accessibilityLabel={`Rating ${row.rating.toFixed(1)}`}>
                <AppText variant="bodyStrong" color={TONE_COLOR[row.tone]}>
                  {row.rating.toFixed(1)}
                </AppText>
              </View>
            </View>
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    minWidth: 40,
    alignItems: 'center',
    paddingVertical: spacing.xxs,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceRaised,
  },
});
