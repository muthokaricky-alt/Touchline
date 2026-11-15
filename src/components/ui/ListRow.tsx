import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, layout, radii, spacing } from '@/theme';

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
  /** Makes the row tappable. */
  onPress?: () => void;
  /** Screen-reader label for tappable rows; defaults to title + subtitle. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  divider,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: ListRowProps) {
  const content = (
    <>
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
    </>
  );

  if (!onPress) return <View style={[styles.row, divider && styles.divider]}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, styles.pressable, divider && styles.divider, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  pressable: { minHeight: layout.minTouchTarget, borderRadius: radii.sm },
  pressed: { backgroundColor: colors.surfacePressed },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  text: { flex: 1, minWidth: 0, gap: spacing.xxs },
});
