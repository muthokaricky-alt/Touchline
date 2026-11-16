import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import type { PositionFit } from '@/game/squad/position-fit';
import type { TeamSheetSlotView } from '@/game/squad/team-sheet';
import { POSITION_NAMES } from '@/game/positions';
import { colors, radii, spacing, type ColorToken } from '@/theme';

/**
 * A vertical pitch (own goal at the bottom) with one tappable marker per
 * formation slot. Markers are placed with percentages from the slot's x/y,
 * so the pitch scales to any width without measuring the screen.
 */

const MARKER_WIDTH = 78;
const MARKER_HEIGHT = 64;

const FIT_RING: Record<PositionFit, ColorToken> = {
  natural: 'accent',
  accomplished: 'warning',
  unfamiliar: 'danger',
};

const FIT_WORD: Record<PositionFit, string> = {
  natural: 'natural position',
  accomplished: 'accomplished',
  unfamiliar: 'out of position',
};

type PitchProps = {
  slots: readonly TeamSheetSlotView[];
  onSlotPress: (slotId: string) => void;
  /** The slot picked for a swap, highlighted. */
  selectedSlotId?: string | null;
  /** What tapping a slot will do, for screen readers. */
  hintFor?: (slot: TeamSheetSlotView) => string;
};

export function Pitch({ slots, onSlotPress, selectedSlotId = null, hintFor }: PitchProps) {
  return (
    <View style={styles.pitch}>
      <PitchMarkings />
      {slots.map((slot) => (
        <SlotMarker
          key={slot.slotId}
          slot={slot}
          selected={slot.slotId === selectedSlotId}
          hint={hintFor?.(slot) ?? 'Choose a player for this position'}
          onPress={() => onSlotPress(slot.slotId)}
        />
      ))}
    </View>
  );
}

function SlotMarker({ slot, selected, hint, onPress }: { slot: TeamSheetSlotView; selected: boolean; hint: string; onPress: () => void }) {
  const { player } = slot;
  const unavailable = player ? (player.injured ? 'Injured' : player.suspended ? 'Suspended' : null) : null;
  const label = player
    ? `${slot.slotId}: ${player.shortName}, rating ${player.rating}, ${FIT_WORD[player.fit]}${unavailable ? `, ${unavailable.toLowerCase()}` : player.fitness < 90 ? `, ${player.fitness}% fit` : ''}`
    : `${slot.slotId}: empty, ${POSITION_NAMES[slot.position]} needed`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.marker,
        { left: `${slot.x * 100}%`, top: `${(1 - slot.y) * 100}%` },
        pressed && styles.markerPressed,
        selected && styles.markerSelected,
      ]}>
      <View
        style={[
          styles.shirt,
          player ? { borderColor: colors[unavailable ? 'danger' : FIT_RING[player.fit]] } : styles.shirtEmpty,
        ]}>
        <AppText variant="bodyStrong" color={player ? 'textPrimary' : 'textSecondary'}>
          {player ? (player.squadNumber ?? '–') : '+'}
        </AppText>
      </View>
      <AppText variant="caption" numberOfLines={1} align="center" style={styles.name}>
        {player ? player.lastName : 'Empty'}
      </AppText>
      <AppText
        variant="overline"
        color={unavailable ? 'danger' : player && player.fitness < 75 ? 'warning' : 'textSecondary'}
        numberOfLines={1}
        align="center">
        {player ? (unavailable ?? (player.fitness < 90 ? `${slot.slotId} · ${player.fitness}%` : `${slot.slotId} · ${player.rating}`)) : slot.slotId}
      </AppText>
    </Pressable>
  );
}

/** Halfway line, centre circle and penalty boxes. Purely decorative. */
function PitchMarkings() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <View style={styles.halfway} />
      <View style={styles.centreWrap}>
        <View style={styles.centreCircle} />
      </View>
      <View style={[styles.box, styles.boxTop]} />
      <View style={[styles.box, styles.boxBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  pitch: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    aspectRatio: 0.72,
    backgroundColor: colors.pitch,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.pitchLine,
    overflow: 'hidden',
  },
  halfway: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: colors.pitchLine },
  centreWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  centreCircle: { width: '26%', aspectRatio: 1, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.pitchLine },
  box: { position: 'absolute', left: '22%', right: '22%', height: '14%', borderWidth: 1, borderColor: colors.pitchLine },
  boxTop: { top: -1 },
  boxBottom: { bottom: -1 },
  marker: {
    position: 'absolute',
    width: MARKER_WIDTH,
    height: MARKER_HEIGHT,
    marginLeft: -MARKER_WIDTH / 2,
    marginTop: -MARKER_HEIGHT / 2,
    alignItems: 'center',
    gap: 1,
    borderRadius: radii.md,
  },
  markerPressed: { backgroundColor: colors.surfacePressed },
  markerSelected: { backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent },
  shirt: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    borderWidth: 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shirtEmpty: { borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: 'transparent' },
  name: { maxWidth: MARKER_WIDTH, marginTop: spacing.xxs },
});
