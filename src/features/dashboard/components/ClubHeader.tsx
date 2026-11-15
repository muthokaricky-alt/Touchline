import { StyleSheet, View } from 'react-native';

import { AppText, Pill } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import type { DashboardSummary } from '../dashboard.types';

type ClubHeaderProps = Pick<DashboardSummary, 'manager' | 'club' | 'season'>;

export function ClubHeader({ manager, club, season }: ClubHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.crest} accessibilityElementsHidden importantForAccessibility="no">
        <AppText variant="heading" color="onAccent">
          {club.shortName}
        </AppText>
      </View>
      <View style={styles.text}>
        <AppText variant="overline" color="textSecondary">
          {season.currentDate}
        </AppText>
        <AppText variant="display" numberOfLines={2} accessibilityRole="header">
          {club.name}
        </AppText>
        <View style={styles.meta}>
          <Pill label={`Season ${season.label}`} tone="accent" />
          <AppText variant="caption" color="textSecondary">
            Manager {manager.name} · Matchday {season.matchday}/{season.totalMatchdays}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  crest: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: spacing.xs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
