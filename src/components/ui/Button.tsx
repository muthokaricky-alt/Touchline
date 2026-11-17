import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, layout, radii, spacing } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  /** `danger` is for destructive actions (e.g. "start over"), so they never look like the safe choice. */
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  /** For screen readers when the label alone is cryptic (e.g. "2×"). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /**
   * For actions that take a moment (simulating a matchday): shown on the
   * button straight away, and the action runs once that's on screen, so a
   * tap always gets an answer within a frame or two.
   */
  busyLabel?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  busyLabel,
}: ButtonProps) {
  const isPrimary = variant === 'primary';
  const contentColor = variant === 'secondary' ? 'textPrimary' : 'onAccent';
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const press = () => {
    if (!onPress) return;
    if (!busyLabel) return onPress();
    setBusy(true);
    // Two frames: the busy label is drawn before the (synchronous) work blocks the thread.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        try {
          onPress();
        } finally {
          if (mounted.current) setBusy(false);
        }
      }),
    );
  };

  return (
    <PressableScale
      onPress={press}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : variant === 'danger' ? styles.danger : styles.secondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <View style={styles.content}>
        {icon ? <Icon name={icon} size={18} color={contentColor} /> : null}
        <AppText variant="bodyStrong" color={contentColor}>
          {busy && busyLabel ? busyLabel : label}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.minTouchTarget,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  danger: { backgroundColor: colors.danger },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
