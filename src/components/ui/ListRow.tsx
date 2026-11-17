import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, layout, radii, spacing } from '@/theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

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
  /** A second action on a long press (e.g. open a player's profile while taps select him). */
  onLongPress?: () => void;
  /** Screen-reader label for tappable rows; defaults to title + subtitle. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Highlights the row (e.g. the player picked for a swap). */
  selected?: boolean;
};

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  divider,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  selected,
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
    // Wide rows shrink less than buttons: the same feel without the whole card lurching.
    <PressableScale
      scaleTo={0.985}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [styles.row, styles.pressable, divider && styles.divider, pressed && styles.pressed, selected && styles.selected]}>
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  pressable: { minHeight: layout.minTouchTarget, borderRadius: radii.sm },
  pressed: { backgroundColor: colors.surfacePressed },
  selected: { backgroundColor: colors.accentMuted },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  text: { flex: 1, minWidth: 0, gap: spacing.xxs },
});
