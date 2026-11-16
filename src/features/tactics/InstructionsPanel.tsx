import { StyleSheet, View } from 'react-native';

import { AppText, Card, ChoiceChips, Icon, Pill } from '@/components/ui';
import type { TacticalNote } from '@/game/tactics/analysis';
import { PLAYING_STYLE_LIST, type PlayingStyle, type PlayingStyleId } from '@/game/tactics/presets';
import { INSTRUCTION_OPTIONS, INSTRUCTION_ORDER, type Instruction, type Tactics } from '@/game/tactics/tactics';
import { colors, spacing } from '@/theme';

import { INSTRUCTION_LABELS } from './labels';

const STYLE_OPTIONS = PLAYING_STYLE_LIST.map((s) => ({ value: s.id, label: s.name }));

type InstructionsPanelProps = {
  tactics: Tactics;
  /** Matching playing style, or null when the instructions are custom. */
  style: PlayingStyle | null;
  notes: readonly TacticalNote[];
  onStyleChange: (styleId: PlayingStyleId) => void;
  onInstructionChange: <K extends Instruction>(key: K, value: Tactics[K]) => void;
};

/** Playing style presets, the assistant's notes, and each team instruction. */
export function InstructionsPanel({ tactics, style, notes, onStyleChange, onInstructionChange }: InstructionsPanelProps) {
  return (
    <View style={styles.columns}>
      <View style={styles.column}>
        <Card title="Playing style" icon="tactics" headerAction={style ? null : <Pill label="Custom" tone="warning" />}>
          <ChoiceChips
            options={STYLE_OPTIONS}
            value={style?.id ?? null}
            onChange={onStyleChange}
            accessibilityLabel="Playing style"
          />
          <AppText color="textSecondary">
            {style ? style.summary : 'Your own combination of instructions. Pick a style to reset them all.'}
          </AppText>
        </Card>

        <AssistantCard notes={notes} />
      </View>

      <View style={styles.column}>
        <Card title="Team instructions" icon="squad">
          {INSTRUCTION_ORDER.map((key, index) => (
            <InstructionRow
              key={key}
              instruction={key}
              value={tactics[key]}
              divider={index > 0}
              onChange={(value) => onInstructionChange(key, value)}
            />
          ))}
        </Card>
      </View>
    </View>
  );
}

/** One instruction with its options and the selected option's hint (also used in the match centre). */
export function InstructionRow<K extends Instruction>({
  instruction,
  value,
  divider,
  onChange,
}: {
  instruction: K;
  value: Tactics[K];
  divider: boolean;
  onChange: (value: Tactics[K]) => void;
}) {
  const labels = INSTRUCTION_LABELS[instruction];
  const optionLabels: Record<Tactics[K], { label: string; hint: string }> = labels.options;
  const options = INSTRUCTION_OPTIONS[instruction].map((option) => ({
    value: option,
    label: optionLabels[option].label,
  }));

  return (
    <View style={[styles.instruction, divider && styles.divider]}>
      <AppText variant="overline" color="textSecondary">
        {labels.title}
      </AppText>
      <ChoiceChips options={options} value={value} onChange={onChange} accessibilityLabel={labels.title} />
      <AppText variant="caption" color="textSecondary">
        {optionLabels[value].hint}
      </AppText>
    </View>
  );
}

function AssistantCard({ notes }: { notes: readonly TacticalNote[] }) {
  return (
    <Card title="Assistant manager" icon="assistant">
      {notes.length === 0 ? (
        <AppText color="textSecondary">No concerns. These instructions suit the players you’ve picked.</AppText>
      ) : (
        notes.map((note) => (
          <View key={note.id} style={styles.note}>
            <Icon name={note.tone === 'warning' ? 'warning' : 'check'} size={16} color={note.tone === 'warning' ? 'warning' : 'accent'} />
            <AppText style={styles.noteText}>{note.message}</AppText>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, gap: spacing.lg, minWidth: 0 },
  instruction: { gap: spacing.sm, paddingTop: spacing.xs },
  divider: { paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  noteText: { flex: 1 },
});
