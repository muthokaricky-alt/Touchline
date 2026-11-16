import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ChoiceChips, Pill, StatTile } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { formatCompactCurrency, formatDate, formatWeeklyWage } from '@/utils/format';

export type ContractCardView = {
  weeklyWage: number;
  contractEnds: string;
  value: number;
  isKeyPlayer: boolean;
  listed: boolean;
  windowOpen: boolean;
  /** What he'd sign a new deal for, or why he won't. */
  /** `years`: the lengths that would extend his current deal (empty = it already runs as long as he'd sign for). */
  renewal: { willing: true; weeklyWage: number; years: readonly number[] } | { willing: false; reason: string };
  releaseCost: number;
  canRelease: boolean;
  minSquad: number;
  offers: readonly { id: string; clubName: string; fee: number; expires: string }[];
};

type ContractCardProps = {
  view: ContractCardView;
  onToggleListed: () => void;
  onAcceptOffer: (offerId: string) => string | null;
  onRejectOffer: (offerId: string) => void;
  /** Each returns an error message, or null when it worked. */
  onRenew: (years: number) => string | null;
  onRelease: () => string | null;
};

/**
 * On the user's own players: contract, transfer list, offers, renewal and
 * release. The renewal is offered at exactly what the player demands; the
 * store re-checks it either way.
 */
export function ContractCard({ view, onToggleListed, onAcceptOffer, onRejectOffer, onRenew, onRelease }: ContractCardProps) {
  const options = view.renewal.willing ? view.renewal.years : [];
  const [years, setYears] = useState(options.includes(3) ? 3 : (options.at(-1) ?? 1));
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const report = (error: string | null, success: string) => setMessage(error ? { text: error, ok: false } : { text: success, ok: true });

  return (
    <Card
      title="Transfer & contract"
      icon="transfers"
      headerAction={view.listed ? <Pill label="Transfer listed" tone="warning" /> : view.isKeyPlayer ? <Pill label="First team" tone="accent" /> : null}>
      <View style={styles.tiles}>
        <StatTile label="Wage" value={formatWeeklyWage(view.weeklyWage)} detail={`until ${formatDate(view.contractEnds)}`} />
        <StatTile label="Value" value={formatCompactCurrency(view.value)} />
      </View>

      {view.offers.map((offer) => (
        <View key={offer.id} style={styles.offer}>
          <AppText variant="bodyStrong">
            {offer.clubName} bid {formatCompactCurrency(offer.fee)}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            Open until {formatDate(offer.expires)}
          </AppText>
          <View style={styles.row}>
            <Button label="Accept" onPress={() => report(onAcceptOffer(offer.id), 'Sold.')} />
            <Button label="Reject" variant="secondary" onPress={() => onRejectOffer(offer.id)} />
          </View>
        </View>
      ))}

      <Button
        label={view.listed ? 'Remove from transfer list' : 'Add to transfer list'}
        variant="secondary"
        onPress={onToggleListed}
      />
      {view.listed && !view.windowOpen ? (
        <AppText variant="caption" color="textSecondary">
          Clubs make offers while a transfer window is open.
        </AppText>
      ) : null}

      <AppText variant="overline" color="textSecondary">
        New contract
      </AppText>
      {view.renewal.willing && options.length === 0 ? (
        <AppText color="textSecondary">His contract already runs until {formatDate(view.contractEnds)}, as long as he’d sign for.</AppText>
      ) : view.renewal.willing ? (
        <>
          <AppText color="textSecondary">He’d sign for {formatWeeklyWage(view.renewal.weeklyWage)}.</AppText>
          <ChoiceChips
            options={options.map((y) => ({ value: String(y), label: `${y} yr` }))}
            value={String(years)}
            onChange={(v) => setYears(Number(v))}
            accessibilityLabel="Contract length"
          />
          <Button label="Offer new contract" onPress={() => report(onRenew(years), `New ${years}-year contract signed.`)} />
        </>
      ) : (
        <AppText color="warning">{view.renewal.reason}</AppText>
      )}

      <AppText variant="overline" color="textSecondary">
        Release
      </AppText>
      {!view.canRelease ? (
        <AppText variant="caption" color="textSecondary">
          You need at least {view.minSquad} players, so you can’t release anyone right now.
        </AppText>
      ) : confirmRelease ? (
        <>
          <AppText>
            Terminate his contract for {formatCompactCurrency(view.releaseCost)} (half his remaining wages)? He becomes a free agent.
          </AppText>
          <View style={styles.row}>
            <Button label="Release" variant="danger" onPress={() => report(onRelease(), 'Released.')} />
            <Button label="Cancel" variant="secondary" onPress={() => setConfirmRelease(false)} />
          </View>
        </>
      ) : (
        <Button label="Release player" variant="secondary" onPress={() => setConfirmRelease(true)} />
      )}

      {message ? (
        <AppText color={message.ok ? 'accent' : 'warning'} accessibilityLiveRegion="polite">
          {message.text}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  offer: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceRaised },
});
