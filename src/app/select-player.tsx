import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { AppText, Button, PageHeader, Screen } from '@/components/ui';
import type { PlayerId } from '@/data/schemas';
import { parsePickerTarget } from '@/game/squad/team-sheet';
import { PlayerPickerScreen } from '@/features/team/PlayerPickerScreen';
import { useGameStore } from '@/store/game-store';
import { usePlayerPicker } from '@/store/hooks';

/**
 * Modal: pick a player for `?target=<slotId>` or `?target=bench`.
 * A search param (not a `[slot]` path segment) keeps this a single static
 * route, so the web export doesn't need a page per slot.
 */
export default function SelectPlayerRoute() {
  const { target: rawTarget } = useLocalSearchParams<{ target?: string }>();
  const router = useRouter();
  const formationId = useGameStore((s) => s.lineup.formationId);
  const assignToSlot = useGameStore((s) => s.assignToSlot);
  const addSubstitute = useGameStore((s) => s.addSubstitute);
  const clearSlot = useGameStore((s) => s.clearSlot);

  // Memoised so the picker hook receives a stable object between renders.
  const target = useMemo(() => parsePickerTarget(rawTarget, formationId), [rawTarget, formationId]);
  const picker = usePlayerPicker(target);

  // Web static export pre-renders this page WITHOUT the ?target query. If the
  // page is opened directly, the browser's first render must match that HTML
  // (React "hydration"), so on web we render an empty frame until mounted.
  // Native has no pre-rendered HTML, so it renders immediately.
  const [mounted, setMounted] = useState(Platform.OS !== 'web');
  useEffect(() => setMounted(true), []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/tactics'));

  if (!mounted) return <Screen bottomInset>{null}</Screen>;

  if (!target || !picker) {
    return (
      <Screen bottomInset>
        <PageHeader title="Nothing to choose" />
        <AppText color="textSecondary">This position isn't part of the current formation.</AppText>
        <Button label="Back to team" onPress={close} />
      </Screen>
    );
  }

  const select = (playerId: PlayerId) => {
    if (target.kind === 'slot') assignToSlot(target.slotId, playerId);
    else addSubstitute(playerId);
    close();
  };

  const clear =
    target.kind === 'slot' && picker.current
      ? () => {
          clearSlot(target.slotId);
          close();
        }
      : undefined;

  return <PlayerPickerScreen picker={picker} onSelect={select} onClear={clear} onClose={close} />;
}
