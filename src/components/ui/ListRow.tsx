import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

import { AppText } from './AppText';

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Element on the left, e.g. an unread dot or a position number. */
  leading?: ReactNode;
  /** Element on the right, e.g. a date or a value. */
  trailing?: ReactNode;
  /** Draw a divider above this row (skip for the first row). */
  divider?: boolean;
};

export function ListRow({ title, subtitle, leading, trailing, divider }: ListRowProps) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      {leading}
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  text: { flex: 1, minWidth: 0, gap: spacing.xxs },
});
