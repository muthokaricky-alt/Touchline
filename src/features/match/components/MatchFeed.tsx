import { StyleSheet, View } from 'react-native';

import { AppText, Icon, type IconName } from '@/components/ui';
import { colors, radii, spacing, type ColorToken } from '@/theme';

import type { TimelineItem, TimelineKind } from '../timeline';

const KIND_STYLE: Record<TimelineKind, { icon: IconName; color: ColorToken }> = {
  goal: { icon: 'match', color: 'accent' },
  chance: { icon: 'trendUp', color: 'textSecondary' },
  card: { icon: 'warning', color: 'warning' },
  substitution: { icon: 'transfers', color: 'info' },
  injury: { icon: 'medical', color: 'danger' },
  whistle: { icon: 'fixtures', color: 'textMuted' },
};

type MatchFeedProps = {
  items: readonly TimelineItem[];
  /** Newest first (live feed) or oldest first (full report). */
  newestFirst?: boolean;
};

/** Commentary lines with minute and icon. Goals are highlighted. */
export function MatchFeed({ items, newestFirst = false }: MatchFeedProps) {
  const ordered = newestFirst ? [...items].reverse() : items;
  return (
    <View style={styles.list}>
      {ordered.map((item) => {
        const style = KIND_STYLE[item.kind];
        const isGoal = item.kind === 'goal';
        return (
          <View key={item.key} style={[styles.row, isGoal && styles.goalRow]}>
            <AppText variant="caption" color="textSecondary" style={styles.clock}>
              {item.clock}
            </AppText>
            <Icon name={style.icon} size={16} color={style.color} />
            <AppText variant={isGoal ? 'bodyStrong' : 'body'} color={item.kind === 'whistle' ? 'textSecondary' : 'textPrimary'} style={styles.text}>
              {item.text}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  goalRow: { backgroundColor: colors.accentMuted, borderRadius: radii.sm },
  clock: { width: 44, textAlign: 'right', paddingTop: 2, fontVariant: ['tabular-nums'] },
  text: { flex: 1 },
});
