import { StyleSheet, View } from 'react-native';

import type { Position } from '@/data/schemas';
import { POSITION_GROUP, POSITION_NAMES, type PositionGroup } from '@/game/positions';
import { colors, radii, type ColorToken } from '@/theme';

import { AppText } from './AppText';

const GROUP_STYLE: Record<PositionGroup, { background: string; text: ColorToken }> = {
  goalkeepers: { background: colors.warningMuted, text: 'warning' },
  defenders: { background: colors.infoMuted, text: 'info' },
  midfielders: { background: colors.accentMuted, text: 'accent' },
  attackers: { background: colors.dangerMuted, text: 'danger' },
};

/** Position code (GK, CB, ST…) tinted by line, so a squad list scans quickly. */
export function PositionBadge({ position }: { position: Position }) {
  const tone = GROUP_STYLE[POSITION_GROUP[position]];
  return (
    <View style={[styles.badge, { backgroundColor: tone.background }]} accessible accessibilityLabel={POSITION_NAMES[position]}>
      <AppText variant="overline" color={tone.text} align="center">
        {position}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { minWidth: 38, paddingHorizontal: 4, paddingVertical: 3, borderRadius: radii.sm, alignItems: 'center' },
});
