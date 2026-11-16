import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Card,
  ChoiceChips,
  Icon,
  IconButton,
  ListRow,
  PageHeader,
  PositionBadge,
  RatingBadge,
  Screen,
  StatTile,
} from '@/components/ui';
import type { PlayerId } from '@/data/schemas';
import type { MarketFilters, MarketPlayerView, MarketScope } from '@/game/transfers/market';
import type { AssignmentView } from '@/game/scouting/scouting';
import type { TransferWindow } from '@/game/transfers/window';
import type { PositionGroup } from '@/game/positions';
import { spacing } from '@/theme';
import { formatCompactCurrency, formatDate, formatWeeklyWage } from '@/utils/format';

export type TransferBudgetView = {
  window: TransferWindow;
  transferBudget: number;
  wageRoom: number;
  squadSize: number;
  maxSquad: number;
};

type TransfersScreenProps = {
  budget: TransferBudgetView;
  filters: MarketFilters;
  onFiltersChange: (filters: MarketFilters) => void;
  results: readonly MarketPlayerView[];
  onPlayerPress: (playerId: PlayerId) => void;
  onBack: () => void;
  /** The scouts' current assignments (tap one to open the player). */
  scouting: { assignments: readonly AssignmentView[]; scouts: number };
};

const GROUPS: readonly { value: PositionGroup | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'goalkeepers', label: 'GK' },
  { value: 'defenders', label: 'DEF' },
  { value: 'midfielders', label: 'MID' },
  { value: 'attackers', label: 'ATT' },
];
const SCOPES: readonly { value: MarketScope; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'free', label: 'Free agents' },
  { value: 'first', label: 'First Div' },
  { value: 'second', label: 'Second Div' },
];
const VALUE_CAPS = [
  { value: 'any', label: 'Any value' },
  { value: '1000000', label: '≤ €1M' },
  { value: '5000000', label: '≤ €5M' },
  { value: '15000000', label: '≤ €15M' },
] as const;

/** Transfer market: window status, budgets, filters and the best matching players. */
export function TransfersScreen({ budget, filters, onFiltersChange, results, onPlayerPress, onBack, scouting }: TransfersScreenProps) {
  const { window } = budget;
  return (
    <Screen bottomInset>
      <PageHeader
        overline="Club"
        title="Transfer market"
        leading={<IconButton icon="back" accessibilityLabel="Back" onPress={onBack} />}
      />

      <Card highlighted={window.open}>
        <View style={styles.windowRow}>
          <Icon name={window.open ? 'transfers' : 'warning'} size={18} color={window.open ? 'accent' : 'warning'} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {window.open
              ? `${window.name} window open · closes ${formatDate(window.closes)}`
              : `Window closed · the ${window.name.toLowerCase()} window opens ${formatDate(window.opensNext)}`}
          </AppText>
        </View>
        {!window.open ? (
          <AppText variant="caption" color="textSecondary">
            You can still sign free agents at any time.
          </AppText>
        ) : null}
        <View style={styles.tiles}>
          {/* Short labels/values: three tiles must fit a phone without truncating. */}
          <StatTile label="Budget" value={formatCompactCurrency(budget.transferBudget)} detail="for fees" />
          <StatTile label="Wage room" value={formatCompactCurrency(budget.wageRoom)} detail="per week" />
          <StatTile label="Squad" value={`${budget.squadSize}`} detail={`of ${budget.maxSquad}`} />
        </View>
      </Card>

      <Card title={`Scouts · ${scouting.assignments.length} of ${scouting.scouts} busy`} icon="person">
        {scouting.assignments.length === 0 ? (
          <AppText color="textSecondary">Open any player’s profile and tap “Scout player” to learn his real potential.</AppText>
        ) : (
          scouting.assignments.map((a, index) => (
            <ListRow
              key={a.playerId}
              title={a.name}
              subtitle={a.clubName}
              trailing={<AppText variant="caption" color="textSecondary">Report {formatDate(a.due)}</AppText>}
              divider={index > 0}
              onPress={() => onPlayerPress(a.playerId)}
            />
          ))
        )}
      </Card>

      <Card title="Search" icon="squad">
        <ChoiceChips options={GROUPS} value={filters.group} onChange={(group) => onFiltersChange({ ...filters, group })} accessibilityLabel="Position" />
        <ChoiceChips options={SCOPES} value={filters.scope} onChange={(scope) => onFiltersChange({ ...filters, scope })} accessibilityLabel="Where" />
        <ChoiceChips
          options={VALUE_CAPS}
          value={filters.maxValue === null ? 'any' : (String(filters.maxValue) as (typeof VALUE_CAPS)[number]['value'])}
          onChange={(v) => onFiltersChange({ ...filters, maxValue: v === 'any' ? null : Number(v) })}
          accessibilityLabel="Maximum value"
        />
      </Card>

      <Card title={`Best matches · ${results.length}`}>
        {results.length === 0 ? (
          <AppText color="textSecondary">No players match these filters.</AppText>
        ) : (
          <View>
            {results.map((p, index) => (
              <ListRow
                key={p.id}
                divider={index > 0}
                title={p.name}
                subtitle={
                  p.clubName
                    ? `${p.age} yrs · ${p.clubName} · ${formatCompactCurrency(p.value)}`
                    : `${p.age} yrs · Free agent · asks ${formatWeeklyWage(p.weeklyWage)}`
                }
                onPress={() => onPlayerPress(p.id)}
                accessibilityHint="Opens the player profile, where you can make an offer"
                leading={<PositionBadge position={p.position} />}
                trailing={
                  <View style={styles.trailing}>
                    <RatingBadge value={p.rating} label="Rating" />
                    <Icon name="chevronRight" size={16} color="textMuted" />
                  </View>
                }
              />
            ))}
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
