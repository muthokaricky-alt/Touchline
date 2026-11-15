import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Pill } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

export type SlotView = {
  slot: number;
  active: boolean;
  /** Null when the slot is empty. */
  title: string | null;
  detail: string | null;
};

type SaveSlotsCardProps = {
  slots: readonly SlotView[];
  /** Each returns an error message, or null when it worked. */
  onLoad: (slot: number) => Promise<string | null>;
  onExport: (slot: number) => Promise<string | null>;
  onImport: (slot: number) => Promise<string | null>;
  onDelete: (slot: number) => Promise<string | null>;
};

/** Three careers side by side: load, export, import and delete. */
export function SaveSlotsCard({ slots, onLoad, onExport, onImport, onDelete }: SaveSlotsCardProps) {
  const [confirm, setConfirm] = useState<{ slot: number; kind: 'delete' | 'import' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<string | null>, success: string | null = null) => {
    setBusy(true);
    setMessage(null);
    try {
      const error = await action();
      setMessage(error ?? success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Save slots" icon="fixtures">
      <AppText variant="caption" color="textSecondary">
        Each slot holds one career. Export a save to keep a copy or move it to another device; import replaces the slot.
      </AppText>
      {slots.map((s) => (
        <View key={s.slot} style={[styles.slot, s.active && styles.active]} accessibilityLabel={`Slot ${s.slot}${s.active ? ', playing' : ''}: ${s.title ?? 'empty'}`}>
          <View style={styles.head}>
            <AppText variant="overline" color="textSecondary">
              Slot {s.slot}
            </AppText>
            {s.active ? <Pill label="Playing" tone="accent" /> : null}
          </View>
          <AppText variant="bodyStrong">{s.title ?? 'Empty'}</AppText>
          {s.detail ? (
            <AppText variant="caption" color="textSecondary">
              {s.detail}
            </AppText>
          ) : null}
          {confirm?.slot === s.slot ? (
            <View style={styles.actions}>
              <AppText color="danger">
                {confirm.kind === 'delete'
                  ? "Delete this career? It can't be undone (export it first to keep a copy)."
                  : 'Replace this career with the imported save? Export it first to keep a copy.'}
              </AppText>
              <Button label="Cancel" variant="secondary" onPress={() => setConfirm(null)} />
              <Button
                label={confirm.kind === 'delete' ? 'Delete' : 'Choose file'}
                variant="danger"
                disabled={busy}
                onPress={() => {
                  const kind = confirm.kind;
                  setConfirm(null);
                  void (kind === 'delete' ? run(() => onDelete(s.slot), 'Slot deleted.') : run(() => onImport(s.slot), 'Save imported.'));
                }}
              />
            </View>
          ) : (
            <View style={styles.actions}>
              {!s.active ? (
                <Button label={s.title ? 'Load' : 'New career'} disabled={busy} onPress={() => void run(() => onLoad(s.slot))} />
              ) : null}
              {s.title ? <Button label="Export" variant="secondary" disabled={busy} onPress={() => void run(() => onExport(s.slot))} /> : null}
              <Button
                label="Import"
                variant="secondary"
                disabled={busy}
                onPress={() => (s.title ? setConfirm({ slot: s.slot, kind: 'import' }) : void run(() => onImport(s.slot), 'Save imported.'))}
              />
              {s.title ? <Button label="Delete" variant="secondary" disabled={busy} onPress={() => setConfirm({ slot: s.slot, kind: 'delete' })} /> : null}
            </View>
          )}
        </View>
      ))}
      {message ? (
        <AppText color="textSecondary" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  slot: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: 'transparent' },
  active: { borderColor: colors.accent },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', paddingTop: spacing.xs },
});
