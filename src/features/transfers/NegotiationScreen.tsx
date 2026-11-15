import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ChoiceChips, Icon, IconButton, PageHeader, Pill, PositionBadge, RatingBadge, Screen } from '@/components/ui';
import type { Position } from '@/data/schemas';
import type { BidResponse, TermsDemand, TermsResponse } from '@/game/transfers/negotiation';
import { roundFee } from '@/game/transfers/valuation';
import { colors, radii, spacing } from '@/theme';
import { formatCompactCurrency, formatWeeklyWage } from '@/utils/format';

export type NegotiationTarget = {
  name: string;
  position: Position;
  age: number;
  rating: number;
  /** null = free agent (no fee, terms only). */
  clubName: string | null;
  value: number;
  askingPrice: number;
  isKeyPlayer: boolean;
  terms: TermsDemand;
  /** Deal-breakers before any talks (window closed, squad full…). */
  blockers: readonly string[];
  transferBudget: number;
  wageRoom: number;
};

type NegotiationScreenProps = {
  target: NegotiationTarget;
  onBid: (fee: number) => BidResponse;
  onTerms: (offer: { weeklyWage: number; years: number }) => TermsResponse;
  /** Completes the deal; returns an error message if it couldn't be done. */
  onSign: (deal: { fee: number; weeklyWage: number; years: number }) => string | null;
  onClose: () => void;
  onViewSquad: () => void;
};

type Stage = { kind: 'bid' } | { kind: 'terms'; fee: number } | { kind: 'signed'; fee: number; weeklyWage: number; years: number } | { kind: 'failed'; reason: string };

/**
 * Bid → club response (accept / counter / reject) → personal terms → signed.
 * Only UI state lives here: every decision comes from the pure negotiation
 * functions, and the final signing is re-checked by the store.
 */
export function NegotiationScreen({ target, onBid, onTerms, onSign, onClose, onViewSquad }: NegotiationScreenProps) {
  const isFree = target.clubName === null;
  const [stage, setStage] = useState<Stage>(
    target.blockers.length ? { kind: 'failed', reason: target.blockers.join(' ') } : isFree ? { kind: 'terms', fee: 0 } : { kind: 'bid' },
  );

  return (
    <Screen bottomInset>
      <PageHeader
        overline={isFree ? 'Free agent' : `Transfer · ${target.clubName}`}
        title={target.name}
        subtitle={`${target.age} yrs${isFree ? '' : ` · value ${formatCompactCurrency(target.value)}`}`}
        leading={<IconButton icon="back" accessibilityLabel="Back" onPress={onClose} />}
        trailing={
          <View style={styles.badges}>
            <PositionBadge position={target.position} />
            <RatingBadge value={target.rating} label="Rating" />
          </View>
        }
      />

      {stage.kind === 'bid' ? (
        <BidStage target={target} onBid={onBid} onAgreed={(fee) => setStage({ kind: 'terms', fee })} onClose={onClose} />
      ) : stage.kind === 'terms' ? (
        <TermsStage
          target={target}
          fee={stage.fee}
          onTerms={onTerms}
          onAgreed={(weeklyWage, years) => {
            const error = onSign({ fee: stage.fee, weeklyWage, years });
            setStage(error ? { kind: 'failed', reason: error } : { kind: 'signed', fee: stage.fee, weeklyWage, years });
          }}
          onClose={onClose}
        />
      ) : stage.kind === 'signed' ? (
        <Card title="Done deal" icon="check" highlighted>
          <AppText variant="heading" accessibilityLiveRegion="polite">
            {target.name} signs a {stage.years}-year contract!
          </AppText>
          <AppText color="textSecondary">
            {stage.fee ? `Fee ${formatCompactCurrency(stage.fee)} · ` : 'Free transfer · '}
            {formatWeeklyWage(stage.weeklyWage)}
          </AppText>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Back to market" variant="secondary" onPress={onClose} />
            </View>
            <View style={styles.flex}>
              <Button label="View squad" icon="squad" onPress={onViewSquad} />
            </View>
          </View>
        </Card>
      ) : (
        <Card title="No deal" icon="warning" highlighted>
          <AppText accessibilityLiveRegion="polite">{stage.reason}</AppText>
          <Button label="Back" variant="secondary" onPress={onClose} />
        </Card>
      )}
    </Screen>
  );
}

function BidStage({ target, onBid, onAgreed, onClose }: { target: NegotiationTarget; onBid: NegotiationScreenProps['onBid']; onAgreed: (fee: number) => void; onClose: () => void }) {
  const step = roundFee(Math.max(25_000, target.value * 0.05));
  const [bid, setBid] = useState(Math.min(target.value, target.transferBudget) || step);
  const [response, setResponse] = useState<BidResponse | null>(null);
  const overBudget = bid > target.transferBudget;

  return (
    <Card title="Your offer" icon="transfers">
      <AppText color="textSecondary">
        {target.isKeyPlayer ? `${target.clubName} see him as a first-team regular. ` : ''}
        Transfer budget {formatCompactCurrency(target.transferBudget)}.
      </AppText>
      <Stepper
        label="Transfer fee"
        value={formatCompactCurrency(bid)}
        onDecrease={() => setBid((b) => Math.max(step, b - step))}
        onIncrease={() => setBid((b) => b + step)}
      />
      {overBudget ? <Pill label="Over your transfer budget" tone="danger" /> : null}

      {response ? (
        <View style={styles.response} accessibilityLiveRegion="polite">
          <Icon name={response.kind === 'reject' ? 'error' : 'warning'} size={16} color={response.kind === 'reject' ? 'danger' : 'warning'} />
          <AppText style={styles.flex}>
            {response.message}
            {response.kind === 'counter' ? ` They want ${formatCompactCurrency(response.askingPrice)}.` : ''}
          </AppText>
        </View>
      ) : null}

      {response?.kind === 'counter' ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button label="Walk away" variant="secondary" onPress={onClose} />
          </View>
          <View style={styles.flex}>
            <Button
              label={`Pay ${formatCompactCurrency(response.askingPrice)}`}
              disabled={response.askingPrice > target.transferBudget}
              onPress={() => {
                const accepted = onBid(response.askingPrice);
                if (accepted.kind === 'accept') onAgreed(accepted.fee);
                else setResponse(accepted);
              }}
            />
          </View>
        </View>
      ) : (
        <Button
          label="Submit offer"
          icon="transfers"
          disabled={overBudget}
          onPress={() => {
            const r = onBid(bid);
            if (r.kind === 'accept') onAgreed(r.fee);
            else setResponse(r);
          }}
        />
      )}
    </Card>
  );
}

function TermsStage({
  target,
  fee,
  onTerms,
  onAgreed,
  onClose,
}: {
  target: NegotiationTarget;
  fee: number;
  onTerms: NegotiationScreenProps['onTerms'];
  onAgreed: (weeklyWage: number, years: number) => void;
  onClose: () => void;
}) {
  const demand = target.terms;
  const [wage, setWage] = useState(demand.willing ? demand.weeklyWage : 0);
  const [years, setYears] = useState(demand.willing ? Math.min(3, demand.maxYears) : 1);
  const [message, setMessage] = useState<string | null>(null);

  if (!demand.willing) {
    return (
      <Card title="Personal terms" icon="person" highlighted>
        <AppText>{demand.reason}</AppText>
        <Button label="Back" variant="secondary" onPress={onClose} />
      </Card>
    );
  }

  const yearOptions = Array.from({ length: demand.maxYears }, (_, i) => ({ value: String(i + 1), label: `${i + 1} yr${i ? 's' : ''}` }));
  const overWageBudget = wage > target.wageRoom;

  return (
    <Card title="Personal terms" icon="person">
      {fee ? <Pill label={`Fee agreed: ${formatCompactCurrency(fee)}`} tone="accent" /> : null}
      <AppText color="textSecondary">
        He's asking for {formatWeeklyWage(demand.weeklyWage)} and up to {demand.maxYears} year{demand.maxYears === 1 ? '' : 's'}. Wage room{' '}
        {formatWeeklyWage(target.wageRoom)}.
      </AppText>
      <Stepper
        label="Weekly wage"
        value={formatWeeklyWage(wage)}
        onDecrease={() => setWage((w) => Math.max(500, w - 250))}
        onIncrease={() => setWage((w) => w + 250)}
      />
      {overWageBudget ? <Pill label="Over your wage budget" tone="danger" /> : null}
      <ChoiceChips options={yearOptions} value={String(years)} onChange={(v) => setYears(Number(v))} accessibilityLabel="Contract length" />
      {message ? (
        <View style={styles.response} accessibilityLiveRegion="polite">
          <Icon name="warning" size={16} color="warning" />
          <AppText style={styles.flex}>{message}</AppText>
        </View>
      ) : null}
      <Button
        label="Offer contract"
        icon="check"
        disabled={overWageBudget}
        onPress={() => {
          const r = onTerms({ weeklyWage: wage, years });
          if (r.accepted) onAgreed(wage, years);
          else setMessage(r.reason);
        }}
      />
    </Card>
  );
}

function Stepper({ label, value, onDecrease, onIncrease }: { label: string; value: string; onDecrease: () => void; onIncrease: () => void }) {
  return (
    <View style={styles.stepper} accessible accessibilityLabel={`${label}: ${value}`}>
      <IconButton icon="remove" accessibilityLabel={`Lower ${label.toLowerCase()}`} onPress={onDecrease} />
      <View style={styles.stepperValue}>
        <AppText variant="overline" color="textSecondary">
          {label}
        </AppText>
        <AppText variant="stat">{value}</AppText>
      </View>
      <IconButton icon="add" accessibilityLabel={`Raise ${label.toLowerCase()}`} onPress={onIncrease} />
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  response: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
  },
  stepperValue: { flex: 1, alignItems: 'center' },
});
