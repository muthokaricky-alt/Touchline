import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Pill } from '@/components/ui';
import { spacing } from '@/theme';
import { formatOrdinal } from '@/utils/format';

import type { SeasonEndSummary } from '../dashboard.types';

type SeasonCompleteCardProps = {
  seasonLabel: string;
  summary: SeasonEndSummary;
  onStartNextSeason: () => void;
  onViewTable: () => void;
};

const ZONE_TEXT: Record<NonNullable<SeasonEndSummary['userZone']>, { label: string; tone: 'accent' | 'danger' }> = {
  champion: { label: 'Champions!', tone: 'accent' },
  promotion: { label: 'Promoted', tone: 'accent' },
  relegation: { label: 'Relegation zone', tone: 'danger' },
};

/** Replaces the next-match card once every fixture has been played. */
export function SeasonCompleteCard({ seasonLabel, summary, onStartNextSeason, onViewTable }: SeasonCompleteCardProps) {
  const zone = summary.userZone ? ZONE_TEXT[summary.userZone] : null;
  return (
    <Card title={`Season ${seasonLabel} complete`} icon="trendUp" highlighted>
      <View style={styles.center}>
        <AppText variant="overline" color="textSecondary">
          You finished
        </AppText>
        <AppText variant="display">{formatOrdinal(summary.userPosition)}</AppText>
        {zone ? <Pill label={zone.label} tone={zone.tone} /> : null}
        <AppText color="textSecondary" align="center">
          {summary.championName} are champions.
        </AppText>
      </View>
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button label="Final table" variant="secondary" icon="table" onPress={onViewTable} />
        </View>
        <View style={styles.flex}>
          <Button label="Next season" icon="fixtures" onPress={onStartNextSeason} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
