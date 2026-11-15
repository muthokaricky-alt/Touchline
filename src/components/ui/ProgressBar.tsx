import { StyleSheet, View } from 'react-native';

import { colors, radii, type ColorToken } from '@/theme';
import { clamp } from '@/utils/math';

type ProgressBarProps = {
  /** Value between 0 and 1. Out-of-range values are clamped. */
  progress: number;
  color?: ColorToken;
  accessibilityLabel?: string;
};

export function ProgressBar({ progress, color = 'accent', accessibilityLabel }: ProgressBarProps) {
  const value = clamp(progress, 0, 1);
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={[styles.fill, { width: `${value * 100}%`, backgroundColor: colors[color] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radii.pill },
});
