import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Pill, StatTile } from '@/components/ui';
import { spacing } from '@/theme';
import { formatCompactCurrency, formatDate, formatWeeklyWage } from '@/utils/format';

type TransferCardProps = {
  clubName: string | null;
  value: number;
  weeklyWage: number | null;
  contractEnds: string | null;
  isKeyPlayer: boolean;
  /** Why a deal can't happen right now (window closed, squad full). */
  blockers: readonly string[];
  /** The player won't join (shown, but you can still open talks to see). */
  unwillingReason: string | null;
  onNegotiate: () => void;
};

/** On another club's player (or a free agent): value, contract and a way into negotiations. */
export function TransferCard({ clubName, value, weeklyWage, contractEnds, isKeyPlayer, blockers, unwillingReason, onNegotiate }: TransferCardProps) {
  const isFree = clubName === null;
  return (
    <Card title="Transfer" icon="transfers" headerAction={isKeyPlayer ? <Pill label="First team" tone="warning" /> : isFree ? <Pill label="Free agent" tone="accent" /> : null}>
      <View style={styles.tiles}>
        <StatTile label={isFree ? 'Fee' : 'Value'} value={isFree ? 'Free' : formatCompactCurrency(value)} />
        <StatTile label="Wage" value={weeklyWage === null ? '–' : formatWeeklyWage(weeklyWage)} detail={contractEnds ? `until ${formatDate(contractEnds)}` : undefined} />
      </View>
      {unwillingReason ? <AppText color="warning">{unwillingReason}</AppText> : null}
      {blockers.length ? (
        <AppText color="textSecondary">{blockers.join(' ')}</AppText>
      ) : (
        <Button label={isFree ? 'Offer a contract' : 'Make an offer'} icon="transfers" onPress={onNegotiate} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
});
