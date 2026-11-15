import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing, type ColorToken } from '@/theme';

import { AppText } from './AppText';

type StatTileProps = {
  label: string;
  value: string;
  /** Small supporting line under the value, e.g. "of 20" or "+2 this week". */
  detail?: string;
  valueColor?: ColorToken;
};

/** Compact number + label block for key football stats. */
export function StatTile({ label, value, detail, valueColor = 'textPrimary' }: StatTileProps) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}${detail ? `, ${detail}` : ''}`}>
      <AppText variant="overline" color="textSecondary" numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="stat" color={valueColor} numberOfLines={1}>
        {value}
      </AppText>
      {detail ? (
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xxs,
  },
});
