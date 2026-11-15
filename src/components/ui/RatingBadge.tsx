import { StyleSheet, View } from 'react-native';

import { ratingTier, type RatingTier } from '@/game/ratings';
import { colors, radii, type ColorToken } from '@/theme';

import { AppText } from './AppText';

const TIER_COLOR: Record<RatingTier, ColorToken> = {
  poor: 'danger',
  average: 'textSecondary',
  good: 'textPrimary',
  excellent: 'accent',
};

type RatingBadgeProps = {
  /** Any 1–20 value: an attribute or a position rating. */
  value: number;
  /** Screen-reader context, e.g. "Finishing" → "Finishing 14 of 20". */
  label?: string;
};

/** A 1–20 number coloured by band, so strengths and weaknesses stand out at a glance. */
export function RatingBadge({ value, label }: RatingBadgeProps) {
  const rounded = Math.round(value);
  return (
    <View
      style={styles.badge}
      accessible
      accessibilityLabel={`${label ? `${label} ` : ''}${rounded} of 20`}>
      <AppText variant="bodyStrong" color={TIER_COLOR[ratingTier(value)]} align="center">
        {rounded}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 32,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
  },
});
