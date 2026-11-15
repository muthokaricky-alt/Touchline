import { StyleSheet, View } from 'react-native';

import { AppText, Card, ProgressBar, StatTile } from '@/components/ui';
import { spacing } from '@/theme';
import { formatCompactCurrency, formatWeeklyWage } from '@/utils/format';

import type { FinanceSummary } from '../dashboard.types';

export function FinanceCard({ finances }: { finances: FinanceSummary }) {
  const wageUsage = finances.weeklyWageBudget > 0 ? finances.weeklyWageBill / finances.weeklyWageBudget : 0;
  return (
    <Card title="Finances" icon="finances">
      <View style={styles.tiles}>
        <StatTile label="Balance" value={formatCompactCurrency(finances.balance)} />
        <StatTile label="Transfer budget" value={formatCompactCurrency(finances.transferBudget)} valueColor="accent" />
      </View>
      <View style={styles.meter}>
        <View style={styles.labels}>
          <AppText variant="caption" color="textSecondary">
            Wage bill
          </AppText>
          <AppText variant="caption">
            {formatWeeklyWage(finances.weeklyWageBill)} of {formatWeeklyWage(finances.weeklyWageBudget)}
          </AppText>
        </View>
        <ProgressBar
          progress={wageUsage}
          color={wageUsage > 0.95 ? 'danger' : 'accent'}
          accessibilityLabel={`Wage budget used ${Math.round(wageUsage * 100)} percent`}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
  meter: { gap: spacing.xs },
  labels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
});
