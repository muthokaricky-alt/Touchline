import { useState } from 'react';
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
import type { LineupIssue, LineupPlace } from '@/game/lineup';
import type { TeamSheetSlotView, TeamSheetView } from '@/game/squad/team-sheet';
import { spacing } from '@/theme';

import { hapticLand } from '@/components/haptics';
import { ConditionTag } from '@/features/player/ConditionTag';

import { Pitch } from './components/Pitch';
import { currentSelection, playerAt, tapOutcome } from './swap';

const FORMATION_OPTIONS = FORMATION_LIST.map((f) => ({ value: f.id, label: f.id }));

type TeamSelectionPanelProps = {
  sheet: TeamSheetView;
  onFormationChange: (formationId: FormationId) => void;
  /** Opens the squad list for a position. */
  onChooseForSlot: (slotId: string) => void;
  /** Swaps whoever is in two places (tap one, tap another). */
  onSwap: (a: LineupPlace, b: LineupPlace) => void;
  /** Opens a player's profile (long press, or Profile in the swap bar). */
  onOpenPlayer: (playerId: PlayerId) => void;
  onAddSubstitute: () => void;
  onRemoveSubstitute: (playerId: PlayerId) => void;
  onAutoPick: () => void;
};

/** Formation, starting XI on the pitch, bench and selection problems. Rendered inside TacticsScreen. */
export function TeamSelectionPanel({
  sheet,
  onFormationChange,
  onChooseForSlot,
  onSwap,
  onOpenPlayer,
  onAddSubstitute,
  onRemoveSubstitute,
  onAutoPick,
}: TeamSelectionPanelProps) {
  // The player picked for a swap. Local UI state: nothing in the game changes until the second tap.
  const [picked, setPicked] = useState<LineupPlace | null>(null);
  const selected = currentSelection(sheet, picked);
  const selectedPlayer = selected ? playerAt(sheet, selected) : null;

  const tap = (place: LineupPlace) => {
    const outcome = tapOutcome(sheet, selected, place);
    if (outcome.kind === 'select') setPicked(outcome.place);
    else setPicked(null);
    if (outcome.kind === 'swap') {
      hapticLand();
      onSwap(outcome.a, outcome.b);
    }
    if (outcome.kind === 'choose') onChooseForSlot(outcome.slotId);
  };
  const slotHint = (slot: TeamSheetSlotView) =>
    selectedPlayer
      ? slot.player?.id === selectedPlayer.id
        ? 'Selected. Tap again to cancel'
        : `Swap with ${selectedPlayer.shortName}`
      : slot.player
        ? 'Select to swap with another player'
        : 'Choose a player for this position';

  return (
    <View style={styles.columns}>
      <View style={styles.column}>
        <Card title="Formation" icon="tactics">
          <ChoiceChips options={FORMATION_OPTIONS} value={sheet.formationId} onChange={onFormationChange} accessibilityLabel="Formation" />
        </Card>
        <Pitch
          slots={sheet.slots}
          onSlotPress={(slotId) => tap({ kind: 'slot', slotId })}
          selectedSlotId={selected?.kind === 'slot' ? selected.slotId : null}
          hintFor={slotHint}
          onPlayerLongPress={onOpenPlayer}
        />
        {/* Below the pitch, so selecting a player never moves the pitch under your finger. */}
        {selected && selectedPlayer ? (
          <SwapBar
            name={selectedPlayer.shortName}
            onProfile={() => {
              setPicked(null);
              onOpenPlayer(selectedPlayer.id);
            }}
            onChoose={
              selected.kind === 'slot'
                ? () => {
                    setPicked(null);
                    onChooseForSlot(selected.slotId);
                  }
                : undefined
            }
            onCancel={() => setPicked(null)}
          />
        ) : (
          <AppText variant="caption" color="textSecondary" align="center">
            Tap a player, then another player or a substitute, to swap them. Press and hold a player for his profile. Tap
            an empty position to pick from the squad. Ring colour: green natural · amber accomplished · red out of position.
          </AppText>
        )}
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
                  onPress={() => tap({ kind: 'bench', playerId: sub.id })}
                  onLongPress={() => onOpenPlayer(sub.id)}
                  selected={selected?.kind === 'bench' && selected.playerId === sub.id}
                  accessibilityLabel={`${sub.shortName}, ${sub.primaryPosition}, rating ${sub.rating}`}
                  accessibilityHint={
                    selectedPlayer
                      ? selectedPlayer.id === sub.id
                        ? 'Selected. Tap again to cancel'
                        : `Swap with ${selectedPlayer.shortName}`
                      : 'Select to swap with another player'
                  }
                  leading={<PositionBadge position={sub.primaryPosition} />}
                  trailing={
                    <View style={styles.inline}>
                      <ConditionTag fitness={sub.fitness} injured={sub.injured} suspended={sub.suspended} />
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

/** Shown while a player is picked for a swap. */
function SwapBar({ name, onProfile, onChoose, onCancel }: { name: string; onProfile: () => void; onChoose?: () => void; onCancel: () => void }) {
  return (
    <Card highlighted>
      <View accessibilityLiveRegion="polite" style={styles.swapText}>
        <AppText variant="bodyStrong">{name} selected</AppText>
        <AppText variant="caption" color="textSecondary">
          Tap another position or a substitute to swap them.
        </AppText>
      </View>
      <View style={styles.swapButtons}>
        <Button label="Profile" icon="person" variant="secondary" onPress={onProfile} />
        {onChoose ? <Button label="Pick from squad" icon="squad" variant="secondary" onPress={onChoose} /> : null}
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    </Card>
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
  swapText: { gap: spacing.xxs },
  swapButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
