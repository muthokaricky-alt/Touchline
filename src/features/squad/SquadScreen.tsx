import { StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, ListRow, PageHeader, PositionBadge, RatingBadge, Screen } from '@/components/ui';
import type { PlayerId } from '@/data/schemas';
import type { SquadGroupView, SquadPlayerView } from '@/game/squad/squad-selectors';
import { spacing } from '@/theme';

type SquadScreenProps = {
  clubName: string;
  groups: readonly SquadGroupView[];
  onPlayerPress: (playerId: PlayerId) => void;
};

/** The user's squad, one card per position group. Layout only: data arrives ready-made. */
export function SquadScreen({ clubName, groups, onPlayerPress }: SquadScreenProps) {
  const playerCount = groups.reduce((sum, g) => sum + g.players.length, 0);

  return (
    <Screen>
      <PageHeader overline={clubName} title="Squad" subtitle={`${playerCount} players · rating shown for each player's main position`} />
      <View style={styles.columns}>
        {groups.map((group) => (
          <Card key={group.group} title={`${group.label} · ${group.players.length}`} style={styles.card}>
            <View>
              {group.players.map((player, index) => (
                <SquadRow key={player.id} player={player} divider={index > 0} onPress={() => onPlayerPress(player.id)} />
              ))}
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

function SquadRow({ player, divider, onPress }: { player: SquadPlayerView; divider: boolean; onPress: () => void }) {
  const also = player.secondaryPositions.length ? ` · also ${player.secondaryPositions.join(', ')}` : '';
  return (
    <ListRow
      title={player.fullName}
      subtitle={`${player.age} yrs · ${player.nationality}${also}`}
      divider={divider}
      onPress={onPress}
      accessibilityLabel={`${player.fullName}, number ${player.squadNumber ?? 'none'}, ${player.primaryPosition}, age ${player.age}, rating ${player.rating}`}
      accessibilityHint="Opens the player profile"
      leading={
        <View style={styles.leading}>
          <AppText variant="bodyStrong" color="textSecondary" style={styles.number}>
            {player.squadNumber ?? '–'}
          </AppText>
          <PositionBadge position={player.primaryPosition} />
        </View>
      }
      trailing={
        <View style={styles.trailing}>
          <RatingBadge value={player.rating} label="Rating" />
          <Icon name="chevronRight" size={16} color="textMuted" />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  // Same wrapping two-column layout as the dashboard (no window measuring → safe for static web).
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  card: { flexGrow: 1, flexBasis: 340, minWidth: 0 },
  leading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  number: { width: 24, textAlign: 'right' },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
