import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  ChoiceChips,
  Icon,
  IconButton,
  ListRow,
  Pill,
  PositionBadge,
  RatingBadge,
} from '@/components/ui';
import type { PlayerId } from '@/data/schemas';
import { FORMATION_LIST, type FormationId } from '@/game/formations';
import type { LineupIssue } from '@/game/lineup';
import type { TeamSheetView } from '@/game/squad/team-sheet';
import { spacing } from '@/theme';

import { Pitch } from './components/Pitch';
import { ConditionTag } from '@/features/player/ConditionTag';

const FORMATION_OPTIONS = FORMATION_LIST.map((f) => ({ value: f.id, label: f.id }));

type TeamSelectionPanelProps = {
  sheet: TeamSheetView;
  onFormationChange: (formationId: FormationId) => void;
  onSlotPress: (slotId: string) => void;
  onAddSubstitute: () => void;
  onRemoveSubstitute: (playerId: PlayerId) => void;
  onAutoPick: () => void;
};

/** Formation, starting XI on the pitch, bench and selection problems. Rendered inside TacticsScreen. */
export function TeamSelectionPanel({
  sheet,
  onFormationChange,
  onSlotPress,
  onAddSubstitute,
  onRemoveSubstitute,
  onAutoPick,
}: TeamSelectionPanelProps) {
  return (
    <View style={styles.columns}>
      <View style={styles.column}>
        <Card title="Formation" icon="tactics">
          <ChoiceChips options={FORMATION_OPTIONS} value={sheet.formationId} onChange={onFormationChange} accessibilityLabel="Formation" />
        </Card>
        <Pitch slots={sheet.slots} onSlotPress={onSlotPress} />
        <AppText variant="caption" color="textSecondary" align="center">
          Tap a position to change who plays there. Ring colour: green natural · amber accomplished · red out of position.
        </AppText>
      </View>

      <View style={styles.column}>
        <Button label="Auto pick best XI" icon="autoPick" variant="secondary" onPress={onAutoPick} />
        {sheet.issues.length > 0 ? <IssuesCard issues={sheet.issues} /> : null}

        <Card
          title={`Substitutes · ${sheet.substitutes.length}/${sheet.benchSize}`}
          icon="squad"
          headerAction={sheet.benchFull ? <Pill label="Full" /> : null}>
          {sheet.substitutes.length === 0 ? (
            <AppText color="textSecondary">No substitutes selected.</AppText>
          ) : (
            <View>
              {sheet.substitutes.map((sub, index) => (
                <ListRow
                  key={sub.id}
                  divider={index > 0}
                  title={sub.shortName}
                  leading={<PositionBadge position={sub.primaryPosition} />}
                  trailing={
                    <View style={styles.inline}>
                      <ConditionTag fitness={sub.fitness} injured={sub.injured} />
                      <RatingBadge value={sub.rating} label="Rating" />
                      <IconButton
                        icon="remove"
                        color="textSecondary"
                        accessibilityLabel={`Remove ${sub.shortName} from the bench`}
                        onPress={() => onRemoveSubstitute(sub.id)}
                      />
                    </View>
                  }
                />
              ))}
            </View>
          )}
          <Button label="Add substitute" icon="add" variant="secondary" disabled={sheet.benchFull} onPress={onAddSubstitute} />
        </Card>
      </View>
    </View>
  );
}

function IssuesCard({ issues }: { issues: readonly LineupIssue[] }) {
  const errors = issues.filter((i) => i.severity === 'error');
  return (
    <Card
      title={errors.length ? 'Team not ready' : 'Selection notes'}
      icon={errors.length ? 'error' : 'warning'}
      highlighted={errors.length > 0}>
      {issues.map((issue, index) => (
        <View key={`${issue.code}-${issue.slotId ?? issue.playerId ?? index}`} style={styles.issue}>
          <Icon name={issue.severity === 'error' ? 'error' : 'warning'} size={16} color={issue.severity === 'error' ? 'danger' : 'warning'} />
          <AppText style={styles.issueText}>{issue.message}</AppText>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, gap: spacing.lg, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  issue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  issueText: { flex: 1 },
});
