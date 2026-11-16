import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, ListRow, Pill, PositionBadge } from '@/components/ui';
import type { PlayerId, Position } from '@/data/schemas';
import { INSTRUCTION_ORDER, type Instruction, type Tactics } from '@/game/tactics/tactics';
import { InstructionRow } from '@/features/tactics/InstructionsPanel';
import { spacing } from '@/theme';

export type ManagedPlayer = { id: PlayerId; name: string; position: Position; detail: string };

type MatchManagementPanelProps = {
  /** e.g. "63'" */
  clock: string;
  subsLeft: number;
  onPitch: readonly ManagedPlayer[];
  bench: readonly ManagedPlayer[];
  tactics: Tactics;
  /** True once the user has made a change (the assistant has stopped making substitutions). */
  inCharge: boolean;
  /** Each returns an error message, or null when the change was made. */
  onSubstitute: (offId: PlayerId, onId: PlayerId) => string | null;
  onApplyTactics: (tactics: Tactics) => string | null;
  onClose: () => void;
};

/**
 * In-match management, shown while the replay is paused: substitutions
 * (pick who comes off, then who comes on) and team instructions. Changes
 * take effect from the next minute; the screen re-simulates the rest.
 */
export function MatchManagementPanel({
  clock,
  subsLeft,
  onPitch,
  bench,
  tactics,
  inCharge,
  onSubstitute,
  onApplyTactics,
  onClose,
}: MatchManagementPanelProps) {
  const [off, setOff] = useState<PlayerId | null>(null);
  const [on, setOn] = useState<PlayerId | null>(null);
  const [draft, setDraft] = useState<Tactics>(tactics);
  const [message, setMessage] = useState<string | null>(null);
  const draftChanged = INSTRUCTION_ORDER.some((key) => draft[key] !== tactics[key]);

  const substitute = () => {
    if (!off || !on) return;
    const error = onSubstitute(off, on);
    setMessage(error);
    if (!error) {
      setOff(null);
      setOn(null);
    }
  };
  const applyTactics = () => setMessage(onApplyTactics(draft));
  const setInstruction = <K extends Instruction>(key: K, value: Tactics[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <View style={styles.panel}>
      <AppText color="textSecondary">
        Changes take effect from the minute after {clock}.
        {inCharge ? ' You’re in charge of substitutions now.' : ' Until you make one, your assistant replaces tired players.'}
      </AppText>
      {message ? (
        <AppText color="danger" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      ) : null}

      <Card title="Substitutions" icon="transfers" headerAction={<Pill label={`${subsLeft} left`} tone={subsLeft > 0 ? 'neutral' : 'warning'} />}>
        <AppText variant="overline" color="textSecondary">
          Take off
        </AppText>
        {onPitch.map((p, index) => (
          <PlayerChoice key={p.id} player={p} selected={off === p.id} divider={index > 0} onPress={() => setOff(off === p.id ? null : p.id)} />
        ))}
        <AppText variant="overline" color="textSecondary">
          Bring on
        </AppText>
        {bench.length === 0 ? <AppText color="textSecondary">No substitutes left on the bench.</AppText> : null}
        {bench.map((p, index) => (
          <PlayerChoice key={p.id} player={p} selected={on === p.id} divider={index > 0} onPress={() => setOn(on === p.id ? null : p.id)} />
        ))}
        <Button label="Make substitution" icon="transfers" disabled={!off || !on || subsLeft <= 0} onPress={substitute} />
      </Card>

      <Card title="Team instructions" icon="tactics">
        {INSTRUCTION_ORDER.map((key, index) => (
          <InstructionRow key={key} instruction={key} value={draft[key]} divider={index > 0} onChange={(value) => setInstruction(key, value)} />
        ))}
        <Button label="Apply instructions" variant="secondary" disabled={!draftChanged} onPress={applyTactics} />
      </Card>

      <Button label="Back to the match" icon="match" onPress={onClose} />
    </View>
  );
}

function PlayerChoice({ player, selected, divider, onPress }: { player: ManagedPlayer; selected: boolean; divider: boolean; onPress: () => void }) {
  return (
    <ListRow
      title={player.name}
      subtitle={player.detail}
      divider={divider}
      onPress={onPress}
      accessibilityLabel={`${player.name}, ${player.position}, ${player.detail}${selected ? ', selected' : ''}`}
      leading={<PositionBadge position={player.position} />}
      trailing={selected ? <Icon name="check" size={20} color="accent" /> : null}
    />
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.lg },
});
