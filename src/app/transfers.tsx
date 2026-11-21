import { useRouter } from 'expo-router';
import { useState } from 'react';

import { TransfersScreen } from '@/features/transfers/TransfersScreen';
import { DEFAULT_FILTERS, type MarketFilters } from '@/game/transfers/market';
import { useGameStore } from '@/store/game-store';
import { useMarketScopes, useRegionScouting, useScoutAssignments, useTransferBudget, useTransferMarket } from '@/store/hooks';

/** Route: transfer market search. */
export default function TransfersRoute() {
  const router = useRouter();
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_FILTERS);
  const budget = useTransferBudget();
  const results = useTransferMarket(filters);
  const scouting = useScoutAssignments();
  const scopes = useMarketScopes();
  const region = useRegionScouting();

  return (
    <TransfersScreen
      budget={budget}
      filters={filters}
      onFiltersChange={setFilters}
      results={results}
      scouting={scouting}
      regionScouting={{
        ...region,
        onSend: (nation, group) => {
          try {
            useGameStore.getState().scoutRegion(nation, group);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        },
        onCancel: (nation, group) => useGameStore.getState().cancelRegionScouting(nation, group),
      }}
      scopes={scopes}
      onPlayerPress={(id) => router.push({ pathname: '/player/[id]', params: { id } })}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/club'))}
    />
  );
}
