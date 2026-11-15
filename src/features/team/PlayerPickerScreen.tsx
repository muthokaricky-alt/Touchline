import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  FitPill,
  IconButton,
  ListRow,
  PageHeader,
  PositionBadge,
  RatingBadge,
  Screen,
} from '@/components/ui';
import type { PlayerId } from '@/data/schemas';
import { POSITION_NAMES } from '@/game/positions';
import type { PlayerOptionView, PlayerPickerView, PlayerStatus } from '@/game/squad/team-sheet';
import { spacing } from '@/theme';
import { ConditionTag } from '@/features/player/ConditionTag';

type PlayerPickerScreenProps = {
  picker: PlayerPickerView;
  onSelect: (playerId: PlayerId) => void;
  /** Only for slots that currently have a player. */
  onClear?: () => void;
  onClose: () => void;
};

function describeStatus(status: PlayerStatus): string {
  switch (status.kind) {
    case 'starter':
      return `Starting at ${status.slotId}`;
    case 'substitute':
      return 'On the bench';
    case 'reserve':
      return 'Not selected';
  }
}

/** Modal list of squad players for one slot (or the bench), best option first. */
export function PlayerPickerScreen({ picker, onSelect, onClear, onClose }: PlayerPickerScreenProps) {
  const title = picker.target.kind === 'slot' ? `Choose ${picker.target.slotId}` : 'Add substitute';
  const subtitle = picker.position ? `${POSITION_NAMES[picker.position]} · best fit first` : 'Best rated first';

  return (
    <Screen bottomInset>
      <PageHeader
        title={title}
        subtitle={subtitle}
        trailing={<IconButton icon="close" accessibilityLabel="Close" onPress={onClose} />}
      />

      {picker.current && onClear ? (
        <Button label={`Remove ${picker.current.fullName}`} icon="remove" variant="secondary" onPress={onClear} />
      ) : null}

      <Card>
        {picker.options.length === 0 ? (
          <AppText color="textSecondary">No players available.</AppText>
        ) : (
          <View>
            {picker.options.map((option, index) => (
              <OptionRow key={option.id} option={option} divider={index > 0} onPress={() => onSelect(option.id)} />
            ))}
          </View>
        )}
      </Card>
    </Screen>
  );
}

function OptionRow({ option, divider, onPress }: { option: PlayerOptionView; divider: boolean; onPress: () => void }) {
  const status = option.injured ? `Injured · ${describeStatus(option.status)}` : describeStatus(option.status);
  return (
    <ListRow
      title={option.fullName}
      subtitle={status}
      divider={divider}
      onPress={onPress}
      accessibilityLabel={`${option.fullName}, ${option.primaryPosition}, rating ${option.rating}${option.fit ? `, ${option.fit}` : ''}, ${status}`}
      leading={
        <View style={styles.leading}>
          <AppText variant="bodyStrong" color="textSecondary" style={styles.number}>
            {option.squadNumber ?? '–'}
          </AppText>
          <PositionBadge position={option.primaryPosition} />
        </View>
      }
      trailing={
        <View style={styles.trailing}>
          <ConditionTag fitness={option.fitness} injured={option.injured} />
          {option.fit ? <FitPill fit={option.fit} /> : null}
          <RatingBadge value={option.rating} label="Rating" />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  leading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  number: { width: 24, textAlign: 'right' },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
