import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { AppText, Button, PageHeader, Screen } from '@/components/ui';
import { NegotiationScreen } from '@/features/transfers/NegotiationScreen';
import { respondToBid, respondToTerms } from '@/game/transfers/negotiation';
import { useGameStore } from '@/store/game-store';
import { useTransferBudget, useTransferTarget } from '@/store/hooks';

/**
 * Route: negotiate with `?player=<id>`. Glue only: the screen holds the
 * stage, the pure functions decide, the store's `signPlayer` re-checks.
 * (A search param is fine here: the app renders nothing until the save has
 * loaded, so there's no pre-rendered page content to mismatch.)
 */
export default function NegotiateRoute() {
  const { player } = useLocalSearchParams<{ player?: string }>();
  const router = useRouter();
  const liveTarget = useTransferTarget(player ?? '');
  const liveBudget = useTransferBudget();
  // Snapshot of the situation when talks opened. Without it, a SUCCESSFUL
  // signing makes the player "ours", the live target becomes null and the
  // "Done deal" screen vanishes (found in the browser test). The store
  // re-checks everything when signing, so a frozen view is safe.
  const [snapshot] = useState(() => ({ target: liveTarget, budget: liveBudget }));
  const target = snapshot.target ?? liveTarget;
  const budget = snapshot.target ? snapshot.budget : liveBudget;
  const signPlayer = useGameStore((s) => s.signPlayer);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/transfers'));

  if (!target || !player) {
    return (
      <Screen bottomInset>
        <PageHeader title="No one to sign" />
        <AppText color="textSecondary">This player isn’t available.</AppText>
        <Button label="Back" onPress={close} />
      </Screen>
    );
  }

  const { ctx } = target;
  return (
    <NegotiationScreen
      // A different player starts a fresh negotiation.
      key={player}
      target={{
        name: target.name,
        position: ctx.player.primaryPosition,
        age: ctx.age,
        rating: Math.round(ctx.ability),
        clubName: ctx.club?.name ?? null,
        value: ctx.value,
        askingPrice: target.askingPrice,
        isKeyPlayer: ctx.isKeyPlayer,
        terms: target.terms,
        blockers: target.blockers,
        transferBudget: budget.transferBudget,
        wageRoom: budget.wageRoom,
      }}
      onBid={(fee) => respondToBid(ctx, fee)}
      onTerms={(offer) => respondToTerms(target.terms, offer)}
      onSign={(deal) => {
        try {
          signPlayer({ playerId: player, ...deal });
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      }}
      onClose={close}
      onViewSquad={() => router.navigate('/squad')}
    />
  );
}
