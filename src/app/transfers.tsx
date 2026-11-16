import { useRouter } from 'expo-router';
import { useState } from 'react';

import { TransfersScreen } from '@/features/transfers/TransfersScreen';
import { DEFAULT_FILTERS, type MarketFilters } from '@/game/transfers/market';
import { useScoutAssignments, useTransferBudget, useTransferMarket } from '@/store/hooks';

/** Route: transfer market search. */
export default function TransfersRoute() {
  const router = useRouter();
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_FILTERS);
  const budget = useTransferBudget();
  const results = useTransferMarket(filters);
  const scouting = useScoutAssignments();

  return (
    <TransfersScreen
      budget={budget}
      filters={filters}
      onFiltersChange={setFilters}
      results={results}
      scouting={scouting}
      onPlayerPress={(id) => router.push({ pathname: '/player/[id]', params: { id } })}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/club'))}
    />
  );
}
