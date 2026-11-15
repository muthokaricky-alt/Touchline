import { Pressable, StyleSheet, View } from 'react-native';

import { colors, layout, radii, spacing } from '@/theme';

import { AppText } from './AppText';

type ChoiceChipsProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  /** null = nothing selected (e.g. custom tactics that match no playing style). */
  value: T | null;
  onChange: (value: T) => void;
  /** Describes the group for screen readers, e.g. "Formation". */
  accessibilityLabel: string;
};

/** A single-choice row of chips (formation picker, later: mentality, pressing…). Wraps on narrow screens. */
export function ChoiceChips<T extends string>({ options, value, onChange, accessibilityLabel }: ChoiceChipsProps<T>) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={option.label}
            style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && !selected && styles.pressed]}>
            <AppText variant="bodyStrong" color={selected ? 'onAccent' : 'textPrimary'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { backgroundColor: colors.surfacePressed },
});
