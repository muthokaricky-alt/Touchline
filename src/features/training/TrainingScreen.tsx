import { StyleSheet, View } from 'react-native';

import { AppText, Card, ChoiceChips, IconButton, ListRow, PageHeader, PositionBadge, ProgressBar, RatingBadge, Screen } from '@/components/ui';
import type { PlayerId } from '@/data/schemas';
import type { Training, TrainingFocus, TrainingIntensity } from '@/game/development/development';
import type { ProspectView } from '@/game/development/training-view';
import { spacing } from '@/theme';

type TrainingScreenProps = {
  training: Training;
  onChange: (change: Partial<Training>) => void;
  prospects: readonly ProspectView[];
  onPlayerPress: (id: PlayerId) => void;
  onBack: () => void;
};

const FOCUS_OPTIONS: readonly { value: TrainingFocus; label: string; hint: string }[] = [
  { value: 'balanced', label: 'Balanced', hint: 'Everyone works on everything; development follows each position.' },
  { value: 'attacking', label: 'Attacking', hint: 'Finishing, dribbling, first touch, crossing, composure. Defensive work grows slower.' },
  { value: 'defending', label: 'Defending', hint: 'Tackling, marking, positioning, heading, strength. Attacking work grows slower.' },
  { value: 'technical', label: 'Technical', hint: 'Passing, first touch, dribbling, vision, decisions.' },
  { value: 'physical', label: 'Physical', hint: 'Pace, acceleration, stamina, strength; older players lose their legs more slowly.' },
];

const INTENSITY_OPTIONS: readonly { value: TrainingIntensity; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Slower development (×0.75), very few training injuries.' },
  { value: 'normal', label: 'Normal', hint: 'Standard development and injury risk.' },
  { value: 'heavy', label: 'Heavy', hint: 'Faster development (×1.3), but about three times as many training injuries.' },
];

/** Club training: what the squad works on and how hard, plus the young players' progress. */
export function TrainingScreen({ training, onChange, prospects, onPlayerPress, onBack }: TrainingScreenProps) {
  const focus = FOCUS_OPTIONS.find((o) => o.value === training.focus)!;
  const intensity = INTENSITY_OPTIONS.find((o) => o.value === training.intensity)!;
  return (
    <Screen bottomInset>
      <PageHeader
        title="Training"
        subtitle="Players develop at the start of every month"
        leading={<IconButton icon="back" accessibilityLabel="Back" onPress={onBack} />}
      />
      <View style={styles.columns}>
        <View style={styles.column}>
          <Card title="Focus" icon="tactics">
            <ChoiceChips options={FOCUS_OPTIONS} value={training.focus} onChange={(value) => onChange({ focus: value })} accessibilityLabel="Training focus" />
            <AppText color="textSecondary">{focus.hint}</AppText>
          </Card>
          <Card title="Intensity" icon="trendUp">
            <ChoiceChips
              options={INTENSITY_OPTIONS}
              value={training.intensity}
              onChange={(value) => onChange({ intensity: value })}
              accessibilityLabel="Training intensity"
            />
            <AppText color="textSecondary">{intensity.hint}</AppText>
          </Card>
          <Card title="How players develop" icon="assistant">
            <AppText color="textSecondary">
              Young players grow towards their potential, faster when they play regularly and train hard. Around 30, physical attributes
              start to decline, then technical ones. The Head of Coaching reports progress in your inbox each month.
            </AppText>
          </Card>
        </View>
        <View style={styles.column}>
          <Card title={`Young players · ${prospects.length}`} icon="squad">
            {prospects.length === 0 ? (
              <AppText color="textSecondary">No players aged 23 or under.</AppText>
            ) : (
              <View>
                {prospects.map((p, index) => (
                  <ListRow
                    key={p.id}
                    divider={index > 0}
                    title={p.name}
                    subtitle={`${p.age} yrs · potential ${p.potential}`}
                    onPress={() => onPlayerPress(p.id)}
                    accessibilityLabel={`${p.name}, ${p.position}, age ${p.age}, rating ${p.rating}, potential ${p.potential}`}
                    accessibilityHint="Opens the player profile"
                    leading={<PositionBadge position={p.position} />}
                    trailing={
                      <View style={styles.trailing}>
                        <View style={styles.progress}>
                          <ProgressBar progress={p.progress} accessibilityLabel={`${Math.round(p.progress * 100)} percent of potential`} />
                        </View>
                        <RatingBadge value={p.rating} label="Rating" />
                      </View>
                    }
                  />
                ))}
              </View>
            )}
          </Card>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, gap: spacing.lg, minWidth: 0 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progress: { width: 56 },
});
