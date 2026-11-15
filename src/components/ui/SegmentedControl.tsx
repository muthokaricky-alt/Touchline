import { Pressable, StyleSheet, View } from 'react-native';

import { colors, layout, radii, spacing } from '@/theme';

import { AppText } from './AppText';

type SegmentedControlProps<T extends string> = {
  segments: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/**
 * Switches between views inside one screen (e.g. Lineup / Instructions).
 * Unlike ChoiceChips it fills the width with equal segments, which reads as
 * "navigation" rather than "a setting".
 */
export function SegmentedControl<T extends string>({ segments, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={segment.label}
            style={({ pressed }) => [styles.segment, selected && styles.selected, pressed && !selected && styles.pressed]}>
            <AppText variant="bodyStrong" color={selected ? 'onAccent' : 'textSecondary'} align="center">
              {segment.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: spacing.xs,
    gap: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    minHeight: layout.minTouchTarget - spacing.xs,
    borderRadius: radii.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  selected: { backgroundColor: colors.accent },
  pressed: { backgroundColor: colors.surfacePressed },
});
