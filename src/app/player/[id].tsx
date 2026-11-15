import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppText, Button, PageHeader, Screen } from '@/components/ui';
import { PlayerProfileScreen } from '@/features/player/PlayerProfileScreen';
import { useGameStore } from '@/store/game-store';
import { ContractCard } from '@/features/transfers/ContractCard';
import { TransferCard } from '@/features/transfers/TransferCard';
import { useOwnPlayerContract, usePlayerProfile, useTransferTarget } from '@/store/hooks';

/**
 * Web static export pre-renders an HTML page per player listed here. The
 * build runs this in Node; it works because the store's initial state is
 * deterministic (seeded).
 *
 * Only the user's squad is pre-rendered: with 880 players, rendering every
 * profile made the export huge. Other profiles still open fine via in-app
 * navigation; only a direct URL load of them isn't supported on web.
 */
export async function generateStaticParams(): Promise<Record<string, string>[]> {
  const { database, userClubId } = useGameStore.getState();
  return database.contracts.filter((c) => c.clubId === userClubId).map((c) => ({ id: c.playerId }));
}

export default function PlayerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const profile = usePlayerProfile(id);
  const target = useTransferTarget(id);
  const own = useOwnPlayerContract(id);
  const actions = useGameStore.getState; // actions never change; read them when called

  // Deep links (or a refreshed web page) may have no history to go back to.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/squad'));

  if (!profile) {
    return (
      <Screen bottomInset>
        <PageHeader title="Player not found" />
        <AppText color="textSecondary">There's no player with id “{id}”.</AppText>
        <Button label="Back to squad" onPress={goBack} />
      </Screen>
    );
  }

  /** Runs a store action; its RangeError (e.g. wage budget) becomes a message. */
  const attempt = (action: () => void): string | null => {
    try {
      action();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  // The user's own players get a contract card; other clubs' players and free agents a transfer card.
  const card = own ? (
    <ContractCard
      view={{
        weeklyWage: own.contract.weeklyWage,
        contractEnds: own.contract.endDate,
        value: own.value,
        isKeyPlayer: own.isKeyPlayer,
        listed: own.listed,
        windowOpen: own.windowOpen,
        renewal: own.renewal,
        releaseCost: own.releaseCost,
        canRelease: own.canRelease,
        minSquad: own.minSquad,
        offers: own.offers,
      }}
      onToggleListed={() => actions().toggleTransferListed(id)}
      onAcceptOffer={(offerId) => attempt(() => actions().acceptOffer(offerId))}
      onRejectOffer={(offerId) => actions().rejectOffer(offerId)}
      onRenew={(years) => {
        const renewal = own.renewal;
        return renewal.willing ? attempt(() => actions().renewContract({ playerId: id, weeklyWage: renewal.weeklyWage, years })) : renewal.reason;
      }}
      onRelease={() => attempt(() => actions().releasePlayer(id))}
    />
  ) : target ? (
    <TransferCard
      clubName={target.ctx.club?.name ?? null}
      value={target.ctx.value}
      weeklyWage={target.ctx.contract?.weeklyWage ?? (target.terms.willing ? target.terms.weeklyWage : null)}
      contractEnds={target.ctx.contract?.endDate ?? null}
      isKeyPlayer={target.ctx.isKeyPlayer}
      blockers={target.blockers}
      unwillingReason={target.terms.willing ? null : target.terms.reason}
      onNegotiate={() => router.push({ pathname: '/negotiate', params: { player: id } })}
    />
  ) : null;

  return <PlayerProfileScreen profile={profile} onBack={goBack} extra={card} />;
}
