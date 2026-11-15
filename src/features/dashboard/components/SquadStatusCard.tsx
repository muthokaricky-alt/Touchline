import { StyleSheet, View } from 'react-native';

import { AppText, Card, ProgressBar, StatTile } from '@/components/ui';
import { spacing } from '@/theme';

import type { SquadStatusSummary } from '../dashboard.types';

export function SquadStatusCard({ squad }: { squad: SquadStatusSummary }) {
  const unavailable = squad.injuredCount + squad.suspendedCount;
  return (
    <Card title="Squad status" icon="squad">
      <View style={styles.tiles}>
        <StatTile label="Players" value={String(squad.playerCount)} />
        <StatTile
          label="Unavailable"
          value={String(unavailable)}
          detail={`${squad.injuredCount} inj · ${squad.suspendedCount} sus`}
          valueColor={unavailable > 0 ? 'warning' : 'textPrimary'}
        />
      </View>
      <Meter label="Average fitness" value={squad.averageFitness} />
      <Meter label="Team morale" value={squad.averageMorale} />
    </Card>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const percent = Math.round(value * 100);
  return (
    <View style={styles.meter}>
      <View style={styles.meterLabels}>
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
        <AppText variant="caption">{percent}%</AppText>
      </View>
      <ProgressBar progress={value} accessibilityLabel={`${label} ${percent} percent`} />
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
  meter: { gap: spacing.xs },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between' },
});
