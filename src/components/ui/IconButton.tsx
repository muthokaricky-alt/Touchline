import { Pressable, StyleSheet } from 'react-native';

import { colors, layout, radii, type ColorToken } from '@/theme';

import { Icon, type IconName } from './Icon';

type IconButtonProps = {
  icon: IconName;
  /** Required: icon-only buttons have no visible text for screen readers. */
  accessibilityLabel: string;
  onPress: () => void;
  color?: ColorToken;
  disabled?: boolean;
};

/** Square icon-only button (back, close, remove) with a full-size touch target. */
export function IconButton({ icon, accessibilityLabel, onPress, color = 'textPrimary', disabled = false }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}>
      <Icon name={icon} size={20} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.surfacePressed },
  disabled: { opacity: 0.4 },
});
